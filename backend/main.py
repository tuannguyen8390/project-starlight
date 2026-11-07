"""main.py — Project Starlight API

A private family gallery for a child's paintings, with the things she says
(voice notes / videos) linked to each painting.

Everything that differs between "on my PC" and "on a server" is configuration:
  STARLIGHT_DATA      folder holding the database and media (default: ../data)
  STARLIGHT_PASSWORD  optional family password; empty = no login
  STARLIGHT_WHISPER_MODEL  faster-whisper model size (default: small)
"""
from __future__ import annotations

import hashlib
import hmac
import json
import mimetypes
import os
import re
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel
from PIL import Image, ImageOps

try:  # optional: iPhone HEIC photos
    import pillow_heif

    pillow_heif.register_heif_opener()
except Exception:  # pragma: no cover
    pass

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".heic", ".heif"}
VIDEO_EXT = {".mp4", ".mov", ".m4v", ".webm", ".3gp"}
AUDIO_EXT = {".m4a", ".mp3", ".wav", ".aac", ".ogg", ".oga", ".caf", ".webm_audio"}
COOKIE = "starlight"


# ── helpers ───────────────────────────────────────────────────────────────────

def _iso(dt: datetime) -> str:
    return dt.replace(microsecond=0, tzinfo=None).isoformat()


def _classify(filename: str, content_type: str | None) -> str | None:
    ext = Path(filename).suffix.lower()
    ct = (content_type or "").lower()
    if ct.startswith("image/") or ext in IMAGE_EXT:
        return "painting"
    if ct.startswith("video/") or ext in VIDEO_EXT:
        return "video"
    if ct.startswith("audio/") or ext in AUDIO_EXT:
        return "audio"
    return None


def _exif_date(img: Image.Image) -> str | None:
    """Best capture time found in the photo's EXIF, as naive local ISO."""
    try:
        exif = img.getexif()
        raw = None
        try:
            ifd = exif.get_ifd(0x8769)
            raw = ifd.get(36867) or ifd.get(36868)
        except Exception:
            pass
        raw = raw or exif.get(306)
        if not raw:
            return None
        return _iso(datetime.strptime(str(raw).strip()[:19], "%Y:%m:%d %H:%M:%S"))
    except Exception:
        return None


def _from_ms(value: str | None) -> str | None:
    try:
        return _iso(datetime.fromtimestamp(int(float(value)) / 1000))
    except (TypeError, ValueError, OSError):
        return None


class PaintingPatch(BaseModel):
    title: str | None = None
    painted_at: str | None = None
    favorite: bool | None = None
    tags: list[str] | None = None
    sorted: bool | None = None


class BulkPatch(BaseModel):
    ids: list[str]
    title: str | None = None
    painted_at: str | None = None
    favorite: bool | None = None
    sorted: bool | None = None


class ClipPatch(BaseModel):
    transcript: str | None = None
    recorded_at: str | None = None
    dismissed: bool | None = None


class LinkBody(BaseModel):
    painting_id: str
    clip_id: str


class LoginBody(BaseModel):
    password: str


# ── app factory ───────────────────────────────────────────────────────────────

def create_app(
    data_dir: str | Path | None = None,
    password: str | None = None,
    frontend_dir: str | Path | None = None,
) -> FastAPI:
    root = Path(__file__).resolve().parent
    data = Path(data_dir or os.environ.get("STARLIGHT_DATA") or root.parent / "data")
    pw = password if password is not None else os.environ.get("STARLIGHT_PASSWORD", "")
    dist = Path(frontend_dir) if frontend_dir else root.parent / "frontend" / "dist"

    media = data / "media"
    for sub in ("paintings", "clips", "thumbs", "tmp"):
        (media / sub).mkdir(parents=True, exist_ok=True)
    db_path = data / "starlight.db"

    token = hmac.new(pw.encode(), b"starlight-session", hashlib.sha256).hexdigest() if pw else ""

    @contextmanager
    def db():
        con = sqlite3.connect(db_path)
        con.row_factory = sqlite3.Row
        con.execute("PRAGMA foreign_keys = ON")
        try:
            yield con
            con.commit()
        finally:
            con.close()

    with db() as con:
        con.execute("PRAGMA journal_mode = WAL")
        con.executescript(
            """
            CREATE TABLE IF NOT EXISTS paintings (
              id TEXT PRIMARY KEY,
              title TEXT NOT NULL DEFAULT '',
              painted_at TEXT NOT NULL,
              favorite INTEGER NOT NULL DEFAULT 0,
              sorted INTEGER NOT NULL DEFAULT 0,
              tags TEXT NOT NULL DEFAULT '[]',
              file TEXT NOT NULL,
              thumb TEXT,
              sha256 TEXT NOT NULL UNIQUE,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS clips (
              id TEXT PRIMARY KEY,
              kind TEXT NOT NULL,
              recorded_at TEXT NOT NULL,
              transcript TEXT NOT NULL DEFAULT '',
              dismissed INTEGER NOT NULL DEFAULT 0,
              file TEXT NOT NULL,
              sha256 TEXT NOT NULL UNIQUE,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS links (
              painting_id TEXT NOT NULL REFERENCES paintings(id) ON DELETE CASCADE,
              clip_id TEXT NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
              PRIMARY KEY (painting_id, clip_id)
            );
            """
        )

    app = FastAPI(title="Project Starlight")

    # ── auth ──────────────────────────────────────────────────────────────────
    def authed(request: Request) -> bool:
        if not pw:
            return True
        return hmac.compare_digest(request.cookies.get(COOKIE, ""), token)

    @app.middleware("http")
    async def guard(request: Request, call_next):
        path = request.url.path
        open_paths = ("/api/login", "/api/auth", "/api/logout")
        if pw and (path.startswith("/api/") or path.startswith("/media/")) and path not in open_paths:
            if not authed(request):
                return JSONResponse({"detail": "login required"}, status_code=401)
        return await call_next(request)

    @app.get("/api/auth")
    def auth_state(request: Request):
        return {"required": bool(pw), "ok": authed(request)}

    @app.post("/api/login")
    def login(body: LoginBody):
        if not pw or not hmac.compare_digest(body.password, pw):
            raise HTTPException(401, "wrong password")
        res = JSONResponse({"ok": True})
        res.set_cookie(COOKIE, token, max_age=60 * 60 * 24 * 90, httponly=True, samesite="lax")
        return res

    @app.post("/api/logout")
    def logout():
        res = JSONResponse({"ok": True})
        res.delete_cookie(COOKIE)
        return res

    # ── serializers ───────────────────────────────────────────────────────────
    def painting_out(r: sqlite3.Row, clip_count: int | None = None) -> dict[str, Any]:
        d = {
            "id": r["id"],
            "title": r["title"],
            "painted_at": r["painted_at"],
            "favorite": bool(r["favorite"]),
            "sorted": bool(r["sorted"]),
            "tags": json.loads(r["tags"] or "[]"),
            "url": f"/media/paintings/{r['file']}",
            "thumb_url": f"/media/thumbs/{r['thumb']}" if r["thumb"] else f"/media/paintings/{r['file']}",
            "created_at": r["created_at"],
        }
        if clip_count is not None:
            d["clip_count"] = clip_count
        return d

    def clip_out(con: sqlite3.Connection, r: sqlite3.Row) -> dict[str, Any]:
        pids = [x["painting_id"] for x in con.execute("SELECT painting_id FROM links WHERE clip_id=?", (r["id"],))]
        return {
            "id": r["id"],
            "kind": r["kind"],
            "url": f"/media/clips/{r['file']}",
            "recorded_at": r["recorded_at"],
            "transcript": r["transcript"],
            "dismissed": bool(r["dismissed"]),
            "painting_ids": pids,
            "created_at": r["created_at"],
        }

    # ── upload ────────────────────────────────────────────────────────────────
    @app.post("/api/upload")
    async def upload(
        files: list[UploadFile] = File(...),
        last_modified: list[str] = Form(default=[]),
    ):
        added, duplicates, skipped = [], [], []
        for i, f in enumerate(files):
            name = f.filename or "file"
            kind = _classify(name, f.content_type)
            if kind is None:
                skipped.append({"name": name, "reason": "not a photo, video or audio file"})
                continue
            ext = Path(name).suffix.lower() or (".jpg" if kind == "painting" else ".bin")
            new_id = uuid.uuid4().hex
            tmp = media / "tmp" / f"{new_id}{ext}"
            h = hashlib.sha256()
            with open(tmp, "wb") as out:
                while chunk := await f.read(1 << 20):
                    h.update(chunk)
                    out.write(chunk)
            digest = h.hexdigest()
            with db() as con:
                dup = con.execute(
                    "SELECT 1 FROM paintings WHERE sha256=? UNION SELECT 1 FROM clips WHERE sha256=?",
                    (digest, digest),
                ).fetchone()
            if dup:
                tmp.unlink(missing_ok=True)
                duplicates.append(name)
                continue

            modified = _from_ms(last_modified[i]) if i < len(last_modified) else None
            now = _iso(datetime.now())

            if kind == "painting":
                try:
                    with Image.open(tmp) as img:
                        when = _exif_date(img) or modified or now
                        thumb_name = f"{new_id}.jpg"
                        t = ImageOps.exif_transpose(img).convert("RGB")
                        t.thumbnail((640, 640))
                        t.save(media / "thumbs" / thumb_name, "JPEG", quality=85)
                except Exception:
                    tmp.unlink(missing_ok=True)
                    skipped.append({"name": name, "reason": "could not read this image"})
                    continue
                final = media / "paintings" / f"{new_id}{ext}"
                tmp.replace(final)
                with db() as con:
                    con.execute(
                        "INSERT INTO paintings (id, title, painted_at, file, thumb, sha256, created_at) VALUES (?,?,?,?,?,?,?)",
                        (new_id, "", when, final.name, thumb_name, digest, now),
                    )
            else:
                final = media / "clips" / f"{new_id}{ext}"
                tmp.replace(final)
                with db() as con:
                    con.execute(
                        "INSERT INTO clips (id, kind, recorded_at, file, sha256, created_at) VALUES (?,?,?,?,?,?)",
                        (new_id, kind, modified or now, final.name, digest, now),
                    )
            added.append({"id": new_id, "kind": kind, "name": name})
        return {"added": added, "duplicates": duplicates, "skipped": skipped}

    # ── paintings ─────────────────────────────────────────────────────────────
    @app.get("/api/paintings")
    def list_paintings(
        status: str | None = None,
        favorite: bool | None = None,
        has_voice: bool | None = None,
        q: str | None = None,
        limit: int = 30,
        offset: int = 0,
    ):
        limit = max(1, min(limit, 100))
        offset = max(0, offset)
        where, args = [], []
        if status == "inbox":
            where.append("p.sorted = 0")
        elif status == "sorted":
            where.append("p.sorted = 1")
        if favorite:
            where.append("p.favorite = 1")
        if has_voice:
            where.append("EXISTS (SELECT 1 FROM links l WHERE l.painting_id = p.id)")
        if q:
            like = f"%{q.strip()}%"
            where.append(
                "(p.title LIKE ? OR p.tags LIKE ? OR EXISTS ("
                "SELECT 1 FROM links l JOIN clips c ON c.id = l.clip_id "
                "WHERE l.painting_id = p.id AND c.transcript LIKE ?))"
            )
            args += [like, like, like]
        sql = (
            "SELECT p.*, (SELECT COUNT(*) FROM links l WHERE l.painting_id = p.id) AS n "
            "FROM paintings p"
            + (" WHERE " + " AND ".join(where) if where else "")
            + " ORDER BY p.painted_at DESC, p.created_at DESC"
            + " LIMIT ? OFFSET ?"
        )
        with db() as con:
            return [painting_out(r, r["n"]) for r in con.execute(sql, [*args, limit, offset])]

    @app.get("/api/paintings/{pid}")
    def get_painting(pid: str):
        with db() as con:
            r = con.execute("SELECT * FROM paintings WHERE id=?", (pid,)).fetchone()
            if not r:
                raise HTTPException(404, "painting not found")
            clips = con.execute(
                "SELECT c.* FROM clips c JOIN links l ON l.clip_id = c.id "
                "WHERE l.painting_id=? ORDER BY c.recorded_at",
                (pid,),
            ).fetchall()
            out = painting_out(r, len(clips))
            out["clips"] = [clip_out(con, c) for c in clips]
            return out

    @app.patch("/api/paintings/{pid}")
    def patch_painting(pid: str, body: PaintingPatch):
        sets, args = _painting_sets(body)
        with db() as con:
            if not con.execute("SELECT 1 FROM paintings WHERE id=?", (pid,)).fetchone():
                raise HTTPException(404, "painting not found")
            if sets:
                con.execute(f"UPDATE paintings SET {', '.join(sets)} WHERE id=?", [*args, pid])
        return get_painting(pid)

    @app.post("/api/paintings/bulk")
    def bulk_paintings(body: BulkPatch):
        sets, args = _painting_sets(body)
        if not body.ids or not sets:
            return {"updated": 0}
        marks = ",".join("?" * len(body.ids))
        with db() as con:
            cur = con.execute(f"UPDATE paintings SET {', '.join(sets)} WHERE id IN ({marks})", [*args, *body.ids])
            return {"updated": cur.rowcount}

    def _painting_sets(body) -> tuple[list[str], list[Any]]:
        sets, args = [], []
        if body.title is not None:
            sets.append("title=?")
            args.append(body.title.strip())
        if body.painted_at is not None:
            try:
                args.append(_iso(datetime.fromisoformat(body.painted_at)))
            except ValueError:
                raise HTTPException(422, "painted_at must be an ISO date")
            sets.append("painted_at=?")
        if body.favorite is not None:
            sets.append("favorite=?")
            args.append(int(body.favorite))
        if body.sorted is not None:
            sets.append("sorted=?")
            args.append(int(body.sorted))
        if getattr(body, "tags", None) is not None:
            sets.append("tags=?")
            args.append(json.dumps([t.strip() for t in body.tags if t.strip()], ensure_ascii=False))
        return sets, args

    @app.delete("/api/paintings/{pid}")
    def delete_painting(pid: str):
        with db() as con:
            r = con.execute("SELECT * FROM paintings WHERE id=?", (pid,)).fetchone()
            if not r:
                raise HTTPException(404, "painting not found")
            con.execute("DELETE FROM paintings WHERE id=?", (pid,))
        (media / "paintings" / r["file"]).unlink(missing_ok=True)
        if r["thumb"]:
            (media / "thumbs" / r["thumb"]).unlink(missing_ok=True)
        return {"ok": True}

    # ── clips ─────────────────────────────────────────────────────────────────
    @app.get("/api/clips")
    def list_clips(inbox: bool | None = None):
        sql = "SELECT * FROM clips c"
        if inbox:
            sql += " WHERE c.dismissed = 0 AND NOT EXISTS (SELECT 1 FROM links l WHERE l.clip_id = c.id)"
        sql += " ORDER BY c.recorded_at DESC"
        with db() as con:
            return [clip_out(con, r) for r in con.execute(sql)]

    @app.patch("/api/clips/{cid}")
    def patch_clip(cid: str, body: ClipPatch):
        sets, args = [], []
        if body.transcript is not None:
            sets.append("transcript=?")
            args.append(body.transcript.strip())
        if body.recorded_at is not None:
            try:
                args.append(_iso(datetime.fromisoformat(body.recorded_at)))
            except ValueError:
                raise HTTPException(422, "recorded_at must be an ISO date")
            sets.append("recorded_at=?")
        if body.dismissed is not None:
            sets.append("dismissed=?")
            args.append(int(body.dismissed))
        with db() as con:
            if not con.execute("SELECT 1 FROM clips WHERE id=?", (cid,)).fetchone():
                raise HTTPException(404, "clip not found")
            if sets:
                con.execute(f"UPDATE clips SET {', '.join(sets)} WHERE id=?", [*args, cid])
            return clip_out(con, con.execute("SELECT * FROM clips WHERE id=?", (cid,)).fetchone())

    @app.delete("/api/clips/{cid}")
    def delete_clip(cid: str):
        with db() as con:
            r = con.execute("SELECT * FROM clips WHERE id=?", (cid,)).fetchone()
            if not r:
                raise HTTPException(404, "clip not found")
            con.execute("DELETE FROM clips WHERE id=?", (cid,))
        (media / "clips" / r["file"]).unlink(missing_ok=True)
        return {"ok": True}

    @app.get("/api/clips/{cid}/suggestions")
    def suggestions(cid: str, limit: int = 6):
        """Paintings whose photo time is closest to when the clip was recorded."""
        with db() as con:
            c = con.execute("SELECT * FROM clips WHERE id=?", (cid,)).fetchone()
            if not c:
                raise HTTPException(404, "clip not found")
            when = datetime.fromisoformat(c["recorded_at"])
            linked = {x["painting_id"] for x in con.execute("SELECT painting_id FROM links WHERE clip_id=?", (cid,))}
            rows = con.execute("SELECT * FROM paintings").fetchall()
            scored = sorted(rows, key=lambda r: abs((datetime.fromisoformat(r["painted_at"]) - when).total_seconds()))
            out = []
            for r in scored[: max(1, min(limit, 24))]:
                d = painting_out(r)
                d["diff_seconds"] = int((datetime.fromisoformat(r["painted_at"]) - when).total_seconds())
                d["linked"] = r["id"] in linked
                out.append(d)
            return out

    @app.post("/api/clips/{cid}/transcribe")
    def transcribe(cid: str):
        """Optional: needs `pip install faster-whisper` (runs on this machine)."""
        with db() as con:
            c = con.execute("SELECT * FROM clips WHERE id=?", (cid,)).fetchone()
        if not c:
            raise HTTPException(404, "clip not found")
        try:
            from faster_whisper import WhisperModel
        except ImportError:
            raise HTTPException(501, "Transcription is not installed. Run: pip install faster-whisper")
        model = getattr(app.state, "whisper", None)
        if model is None:
            model = WhisperModel(os.environ.get("STARLIGHT_WHISPER_MODEL", "small"), device="auto", compute_type="int8")
            app.state.whisper = model
        segments, info = model.transcribe(str(media / "clips" / c["file"]), vad_filter=True)
        text = " ".join(s.text.strip() for s in segments).strip()
        with db() as con:
            con.execute("UPDATE clips SET transcript=? WHERE id=?", (text, cid))
        return {"transcript": text, "language": info.language}

    # ── links ─────────────────────────────────────────────────────────────────
    @app.post("/api/links")
    def add_link(body: LinkBody):
        with db() as con:
            if not con.execute("SELECT 1 FROM paintings WHERE id=?", (body.painting_id,)).fetchone():
                raise HTTPException(404, "painting not found")
            if not con.execute("SELECT 1 FROM clips WHERE id=?", (body.clip_id,)).fetchone():
                raise HTTPException(404, "clip not found")
            con.execute("INSERT OR IGNORE INTO links (painting_id, clip_id) VALUES (?,?)", (body.painting_id, body.clip_id))
            # linking a clip counts as sorting the painting
            con.execute("UPDATE paintings SET sorted=1 WHERE id=?", (body.painting_id,))
        return {"ok": True}

    @app.delete("/api/links")
    def remove_link(painting_id: str, clip_id: str):
        with db() as con:
            con.execute("DELETE FROM links WHERE painting_id=? AND clip_id=?", (painting_id, clip_id))
        return {"ok": True}

    # ── stats ─────────────────────────────────────────────────────────────────
    @app.get("/api/stats")
    def stats():
        with db() as con:
            one = lambda sql: con.execute(sql).fetchone()[0]  # noqa: E731
            return {
                "paintings": one("SELECT COUNT(*) FROM paintings WHERE sorted=1"),
                "with_voice": one("SELECT COUNT(DISTINCT painting_id) FROM links"),
                "inbox_paintings": one("SELECT COUNT(*) FROM paintings WHERE sorted=0"),
                "inbox_clips": one(
                    "SELECT COUNT(*) FROM clips c WHERE c.dismissed=0 "
                    "AND NOT EXISTS (SELECT 1 FROM links l WHERE l.clip_id=c.id)"
                ),
            }

    # ── media + frontend ──────────────────────────────────────────────────────
    # Starlette's FileResponse ignores the Range header entirely (always 200,
    # whole file) — iPhone Safari needs real 206 Partial Content to seek
    # video/audio, so media is served through this custom route instead of
    # StaticFiles.
    RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")

    @app.get("/media/{file_path:path}")
    def serve_media(file_path: str, request: Request):
        full = (media / file_path).resolve()
        if media.resolve() not in full.parents:
            raise HTTPException(404, "not found")
        if not full.is_file():
            raise HTTPException(404, "not found")

        file_size = full.stat().st_size
        media_type = mimetypes.guess_type(str(full))[0] or "application/octet-stream"
        range_header = request.headers.get("range")

        if range_header:
            m = RANGE_RE.match(range_header)
            if not m:
                raise HTTPException(416, "invalid range header")
            start = int(m.group(1)) if m.group(1) else 0
            end = int(m.group(2)) if m.group(2) else file_size - 1
            end = min(end, file_size - 1)
            if start > end or start >= file_size:
                raise HTTPException(
                    416, "range not satisfiable",
                    headers={"Content-Range": f"bytes */{file_size}"},
                )
            chunk_size = end - start + 1

            def iterfile():
                with open(full, "rb") as f:
                    f.seek(start)
                    remaining = chunk_size
                    while remaining > 0:
                        data = f.read(min(65536, remaining))
                        if not data:
                            break
                        remaining -= len(data)
                        yield data

            return StreamingResponse(
                iterfile(), status_code=206, media_type=media_type,
                headers={
                    "Content-Range": f"bytes {start}-{end}/{file_size}",
                    "Accept-Ranges": "bytes",
                    "Content-Length": str(chunk_size),
                },
            )

        response = FileResponse(full, media_type=media_type)
        response.headers["Accept-Ranges"] = "bytes"
        return response

    @app.get("/{path:path}")
    def spa(path: str):
        if path.startswith(("api/", "media/")):
            raise HTTPException(404, "not found")
        index = dist / "index.html"
        if not index.exists():
            return JSONResponse(
                {"detail": "Frontend not built yet. Run: cd frontend && npm install && npm run build"},
                status_code=503,
            )
        candidate = (dist / path).resolve()
        if path and candidate.is_file() and dist.resolve() in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(index)

    return app


app = create_app()
