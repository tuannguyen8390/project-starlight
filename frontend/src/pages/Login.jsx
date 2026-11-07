import { useState } from "react";
import { api } from "../api";

export default function Login({ onDone }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api.login(pw);
      onDone();
    } catch {
      setErr("That's not the family password.");
    }
  };
  return (
    <div className="shell">
      <form className="page" onSubmit={submit} style={{ justifyContent: "center", paddingBottom: 20 }}>
        <h1 className="h1">Starlight</h1>
        <p className="sub">Their paintings, and the things they said about them.</p>
        <label className="sub">
          Family password
          <input className="field" type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} />
        </label>
        {err && <div className="toast">{err}</div>}
        <button className="btn primary block" type="submit">Come in</button>
      </form>
    </div>
  );
}
