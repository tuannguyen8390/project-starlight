import io
import sys
from datetime import datetime
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from main import create_app  # noqa: E402


def jpeg(color=(255, 126, 182), taken: str | None = None, size=(80, 60)) -> bytes:
    img = Image.new("RGB", size, color)
    buf = io.BytesIO()
    if taken:
        exif = Image.Exif()
        exif[306] = taken  # DateTime
        img.save(buf, "JPEG", exif=exif)
    else:
        img.save(buf, "JPEG")
    return buf.getvalue()


def ms(y, m, d, h=12, mi=0) -> str:
    return str(int(datetime(y, m, d, h, mi).timestamp() * 1000))


@pytest.fixture()
def client(tmp_path):
    return TestClient(create_app(data_dir=tmp_path / "data", frontend_dir=tmp_path / "nodist"))


def upload(client, items):
    """items: list of (name, bytes, content_type, last_modified_ms)"""
    files = [("files", (n, b, ct)) for n, b, ct, _ in items]
    data = {"last_modified": [m for *_, m in items]}
    return client.post("/api/upload", files=files, data=data)


def test_upload_reads_exif_date_and_makes_thumbnail(client):
    r = upload(client, [("a.jpg", jpeg(taken="2026:10:31 16:02:00"), "image/jpeg", ms(2026, 11, 1))])
    assert r.status_code == 200
    assert len(r.json()["added"]) == 1
    p = client.get("/api/paintings", params={"status": "inbox"}).json()
    assert len(p) == 1
    assert p[0]["painted_at"] == "2026-10-31T16:02:00"  # EXIF wins over file time
    assert client.get(p[0]["thumb_url"]).status_code == 200


def test_falls_back_to_file_time_without_exif(client):
    upload(client, [("a.jpg", jpeg(), "image/jpeg", ms(2026, 11, 3, 9, 30))])
    p = client.get("/api/paintings").json()
    assert p[0]["painted_at"] == "2026-11-03T09:30:00"


def test_duplicates_and_junk_are_skipped(client):
    img = jpeg()
    upload(client, [("a.jpg", img, "image/jpeg", ms(2026, 11, 1))])
    r = upload(
        client,
        [
            ("again.jpg", img, "image/jpeg", ms(2026, 11, 2)),
            ("notes.txt", b"hello", "text/plain", ms(2026, 11, 2)),
            ("broken.jpg", b"not an image", "image/jpeg", ms(2026, 11, 2)),
        ],
    ).json()
    assert r["added"] == []
    assert r["duplicates"] == ["again.jpg"]
    assert {s["name"] for s in r["skipped"]} == {"notes.txt", "broken.jpg"}
    assert len(client.get("/api/paintings").json()) == 1


def test_clip_linking_and_time_suggestions(client):
    upload(
        client,
        [
            ("far.jpg", jpeg((1, 2, 3)), "image/jpeg", ms(2026, 10, 1, 9)),
            ("near.jpg", jpeg((9, 9, 9)), "image/jpeg", ms(2026, 10, 31, 16, 2)),
            ("mid.jpg", jpeg((5, 5, 5)), "image/jpeg", ms(2026, 10, 30, 10)),
            ("clip.m4a", b"fake-audio-bytes", "audio/mp4", ms(2026, 10, 31, 16, 12)),
        ],
    )
    clip = client.get("/api/clips", params={"inbox": True}).json()
    assert len(clip) == 1 and clip[0]["kind"] == "audio"
    cid = clip[0]["id"]

    sug = client.get(f"/api/clips/{cid}/suggestions").json()
    assert [s["painted_at"][:10] for s in sug] == ["2026-10-31", "2026-10-30", "2026-10-01"]
    assert sug[0]["diff_seconds"] == -600  # painting photo was 10 min earlier

    pid = sug[0]["id"]
    assert client.post("/api/links", json={"painting_id": pid, "clip_id": cid}).status_code == 200
    assert client.get("/api/clips", params={"inbox": True}).json() == []  # no longer in the inbox
    detail = client.get(f"/api/paintings/{pid}").json()
    assert detail["clip_count"] == 1 and detail["clips"][0]["id"] == cid
    assert detail["sorted"] is True  # linking sorts the painting

    assert client.get("/api/paintings", params={"has_voice": True}).json()[0]["id"] == pid
    client.delete("/api/links", params={"painting_id": pid, "clip_id": cid})
    assert client.get("/api/paintings", params={"has_voice": True}).json() == []


def test_edit_search_bulk_and_stats(client):
    upload(
        client,
        [
            ("a.jpg", jpeg((1, 1, 1)), "image/jpeg", ms(2026, 11, 1)),
            ("b.jpg", jpeg((2, 2, 2)), "image/jpeg", ms(2026, 11, 2)),
            ("c.m4a", b"audio", "audio/mp4", ms(2026, 11, 2)),
        ],
    )
    ps = client.get("/api/paintings").json()
    ids = [p["id"] for p in ps]
    r = client.post("/api/paintings/bulk", json={"ids": ids, "painted_at": "2026-09-09T10:00:00", "sorted": True})
    assert r.json()["updated"] == 2
    one = client.patch(f"/api/paintings/{ids[0]}", json={"title": "Rainbow day", "favorite": True, "tags": ["sun", " "]}).json()
    assert one["title"] == "Rainbow day" and one["favorite"] and one["tags"] == ["sun"]
    assert client.get("/api/paintings", params={"q": "rainbow"}).json()[0]["id"] == ids[0]
    assert client.get("/api/paintings", params={"favorite": True}).json()[0]["id"] == ids[0]

    cid = client.get("/api/clips").json()[0]["id"]
    client.patch(f"/api/clips/{cid}", json={"transcript": "the sun is happy"})
    client.post("/api/links", json={"painting_id": ids[1], "clip_id": cid})
    assert client.get("/api/paintings", params={"q": "happy"}).json()[0]["id"] == ids[1]  # finds via her words
    s = client.get("/api/stats").json()
    assert s == {"paintings": 2, "with_voice": 1, "inbox_paintings": 0, "inbox_clips": 0}


def test_delete_removes_files(client, tmp_path):
    upload(client, [("a.jpg", jpeg(), "image/jpeg", ms(2026, 11, 1))])
    p = client.get("/api/paintings").json()[0]
    assert client.delete(f"/api/paintings/{p['id']}").status_code == 200
    assert client.get(p["url"]).status_code == 404
    assert client.get(f"/api/paintings/{p['id']}").status_code == 404


def test_password_gate(tmp_path):
    c = TestClient(create_app(data_dir=tmp_path / "d", password="sparkle", frontend_dir=tmp_path / "x"))
    assert c.get("/api/paintings").status_code == 401
    assert c.get("/api/auth").json() == {"required": True, "ok": False}
    assert c.post("/api/login", json={"password": "nope"}).status_code == 401
    assert c.post("/api/login", json={"password": "sparkle"}).status_code == 200
    assert c.get("/api/paintings").status_code == 200
    assert c.get("/api/auth").json()["ok"] is True


def test_video_supports_range_requests(client):
    upload(client, [("v.mp4", b"0123456789" * 50, "video/mp4", ms(2026, 11, 1))])
    url = client.get("/api/clips").json()[0]["url"]
    r = client.get(url, headers={"Range": "bytes=0-9"})
    assert r.status_code == 206 and r.content == b"0123456789"  # iPhone Safari needs this


def test_frontend_not_built_message(client):
    r = client.get("/")
    assert r.status_code == 503 and "npm" in r.json()["detail"]
