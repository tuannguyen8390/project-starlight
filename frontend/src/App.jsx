import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { api } from "./api";
import { StatsProvider } from "./stats";
import Gallery from "./pages/Gallery";
import Inbox from "./pages/Inbox";
import Login from "./pages/Login";
import Match from "./pages/Match";
import Moments from "./pages/Moments";
import Painting from "./pages/Painting";
import Sort from "./pages/Sort";

export default function App() {
  const [auth, setAuth] = useState(null); // null = checking

  useEffect(() => {
    const check = () => api.auth().then((a) => setAuth(!a.required || a.ok)).catch(() => setAuth(true));
    check();
    const onLogin = () => setAuth(false);
    window.addEventListener("starlight-login", onLogin);
    return () => window.removeEventListener("starlight-login", onLogin);
  }, []);

  if (auth === null) return null;
  if (auth === false) return <Login onDone={() => setAuth(true)} />;

  return (
    <BrowserRouter>
      <StatsProvider>
        <Routes>
          <Route path="/" element={<Gallery />} />
          <Route path="/painting/:id" element={<Painting />} />
          <Route path="/inbox" element={<Inbox />} />
          <Route path="/sort" element={<Sort />} />
          <Route path="/match/:id" element={<Match />} />
          <Route path="/moments" element={<Moments />} />
          <Route path="*" element={<Gallery />} />
        </Routes>
      </StatsProvider>
    </BrowserRouter>
  );
}
