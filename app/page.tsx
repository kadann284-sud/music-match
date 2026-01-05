"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

type Rating = "A" | "B" | "C";
type Song = { name: string; artist: string; key: string; rating: Rating };
type User = { id: string; name: string; songs: Song[] };

type Catalog = {
  artists: { name: string; songs: string[] }[];
};

function getRank(points: number) {
  if (points >= 1000) return "💎 ダイヤ";
  if (points >= 301) return "🏆 プラチナ";
  if (points >= 101) return "🥇 ゴールド";
  if (points >= 51) return "🥈 シルバー";
  return "🥉 ブロンズ";
}

function ratingToPoint(rating: Rating) {
  switch (rating) {
    case "A":
      return 3;
    case "B":
      return 2;
    case "C":
      return 1;
  }
}

// ★重み
function ratingWeight(rating: Rating) {
  switch (rating) {
    case "A":
      return 1.0;
    case "B":
      return 0.5;
    case "C":
      return 0.2;
  }
}

function normalizeSong(name: string, artist: string) {
  return (name + "_" + artist)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s\p{Punctuation}]/gu, "");
}

function normalizeForSearch(s: string) {
  return s.toLowerCase().normalize("NFKC").replace(/[\s\p{Punctuation}]/gu, "");
}

export default function HomePage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);

  const [selectedArtist, setSelectedArtist] = useState<string>("");
  const [selectedSong, setSelectedSong] = useState<string>("");
  const [songSearch, setSongSearch] = useState<string>("");

  const [mySongSearch, setMySongSearch] = useState<string>("");

  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const id = localStorage.getItem("userId");
    if (!id) {
      router.push("/login");
      return;
    }
    setUserId(id);
  }, [router]);

  useEffect(() => {
    (async () => {
      const res = await fetch("/data.json", { cache: "no-store" });
      const data = (await res.json()) as Catalog;
      setCatalog(data);

      const firstArtist = data.artists?.[0]?.name ?? "";
      const firstSong = data.artists?.[0]?.songs?.[0] ?? "";
      setSelectedArtist(firstArtist);
      setSelectedSong(firstSong);
    })();
  }, []);

  useEffect(() => {
    if (!userId) return;
    const unsub = onSnapshot(doc(db, "users", userId), (snap) => {
      if (snap.exists()) {
        const data = snap.data() as any;
        setCurrentUser({ id: snap.id, name: data.name, songs: data.songs || [] });
        setSongs(data.songs || []);
      }
    });
    return () => unsub();
  }, [userId]);

  useEffect(() => {
    if (!catalog) return;
    const a = catalog.artists.find((x) => x.name === selectedArtist);
    const first = a?.songs?.[0] ?? "";
    setSelectedSong(first);
  }, [selectedArtist, catalog]);

  const filteredSongs = useMemo(() => {
    if (!catalog) return [];
    const base = catalog.artists.find((a) => a.name === selectedArtist)?.songs ?? [];
    const q = normalizeForSearch(songSearch.trim());
    if (!q) return base;
    return base.filter((title) => normalizeForSearch(title).includes(q));
  }, [catalog, selectedArtist, songSearch]);

  useEffect(() => {
    if (filteredSongs.length === 0) {
      setSelectedSong("");
      return;
    }
    if (!selectedSong || !filteredSongs.includes(selectedSong)) {
      setSelectedSong(filteredSongs[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredSongs]);

  function goNextSong() {
    if (filteredSongs.length === 0) return;
    const idx = filteredSongs.indexOf(selectedSong);
    const nextIdx = idx >= 0 ? (idx + 1) % filteredSongs.length : 0;
    setSelectedSong(filteredSongs[nextIdx]);
  }

  async function addSongWithRating(r: Rating) {
    if (!currentUser) return;
    if (!selectedArtist || !selectedSong) return;

    const key = normalizeSong(selectedSong, selectedArtist);
    if (songs.some((s) => s.key === key)) {
      goNextSong();
      return;
    }

    const newSong: Song = { name: selectedSong, artist: selectedArtist, key, rating: r };
    const updated = { ...currentUser, songs: [...songs, newSong] };
    await setDoc(doc(db, "users", currentUser.id), updated);

    goNextSong();
  }

  function passSong() {
    goNextSong();
  }

  async function deleteSong(songKey: string) {
    if (!currentUser) return;
    const updated = { ...currentUser, songs: songs.filter((s) => s.key !== songKey) };
    await setDoc(doc(db, "users", currentUser.id), updated);
  }

  function goToRoom() {
    router.push(`/room/${crypto.randomUUID()}`);
  }

  const totalPoints = songs.reduce((sum, s) => sum + ratingToPoint(s.rating), 0);
  const rank = getRank(totalPoints);

  const filteredMySongs = useMemo(() => {
    const q = normalizeForSearch(mySongSearch.trim());
    if (!q) return songs;
    return songs.filter((s) => normalizeForSearch(`${s.name}_${s.artist}`).includes(q));
  }, [songs, mySongSearch]);

  // ★重み付き：アーティスト別％
  const artistStats = useMemo(() => {
    if (!catalog) return [];

    // 同一曲が複数登録されることはない想定だが、安全に「曲keyごとに1回」扱い
    const songByKey = new Map<string, Song>();
    for (const s of songs) songByKey.set(s.key, s);

    // アーティストごとの重み合計
    const weightSumByArtist = new Map<string, number>();
    for (const s of songByKey.values()) {
      weightSumByArtist.set(
        s.artist,
        (weightSumByArtist.get(s.artist) ?? 0) + ratingWeight(s.rating)
      );
    }

    return catalog.artists
      .map((a) => {
        const total = a.songs.length; // 分母（全曲数）
        const weightSum = weightSumByArtist.get(a.name) ?? 0; // 分子（重み合計）
        const percent = total > 0 ? Math.round((weightSum / total) * 100) : 0;
        return { artist: a.name, weightSum, total, percent };
      })
      .sort((x, y) => y.percent - x.percent);
  }, [catalog, songs]);

  return (
    <main className="min-h-screen p-4 bg-gray-100 flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-center text-gray-900">🎵 Music Match - ホーム</h1>

      {currentUser && (
        <div className="bg-gray-200 p-3 rounded-lg text-gray-900 font-semibold text-center">
          ユーザー名: <span className="text-blue-700">{currentUser.name}</span> | UserID:{" "}
          <span className="text-green-700">{currentUser.id}</span>
        </div>
      )}

      <div className="bg-white p-3 rounded-lg shadow text-center text-gray-900">
        総ポイント: <span className="font-bold text-purple-700">{totalPoints}</span> | ランク:{" "}
        <span className="font-bold text-yellow-600">{rank}</span>
      </div>

      {/* ★重み付き％ */}
      <div className="bg-white p-3 rounded-lg shadow flex flex-col gap-2">
        <h2 className="font-semibold text-gray-900">📊 アーティスト別 知ってる％（重み付き）</h2>
        <div className="text-sm text-gray-700">
          A=1.0 / B=0.5 / C=0.2（全曲Aなら100%）
        </div>

        {!catalog ? (
          <div className="text-gray-700">読み込み中...</div>
        ) : (
          <div className="flex flex-col gap-1">
            {artistStats.map((a) => (
              <div
                key={a.artist}
                className="flex items-center justify-between rounded-lg px-2 py-2 bg-gray-50"
              >
                <div className="text-gray-900 font-semibold">{a.artist}</div>
                <div className="text-gray-800">
                  <span className="font-bold">{a.percent}%</span>{" "}
                  <span className="text-gray-600">
                    （重み合計 {a.weightSum.toFixed(1)} / 全曲 {a.total}）
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 追加（A/B/Cボタン＋パス） */}
      <div className="bg-white p-3 rounded-lg shadow flex flex-col gap-3">
        <h2 className="font-semibold text-gray-900">➕ 曲を追加（選択式 / 検索）</h2>

        {!catalog ? (
          <div className="text-gray-700">候補曲を読み込み中...</div>
        ) : (
          <>
            <div className="flex flex-col md:flex-row gap-2">
              <select
                className="flex-1 p-2 rounded-lg border text-gray-900"
                value={selectedArtist}
                onChange={(e) => setSelectedArtist(e.target.value)}
              >
                {catalog.artists.map((a) => (
                  <option key={a.name} value={a.name}>
                    {a.name}
                  </option>
                ))}
              </select>

              <input
                className="flex-1 p-2 rounded-lg border text-gray-900"
                placeholder="候補を曲名で検索"
                value={songSearch}
                onChange={(e) => setSongSearch(e.target.value)}
              />

              <select
                className="flex-1 p-2 rounded-lg border text-gray-900"
                value={selectedSong}
                onChange={(e) => setSelectedSong(e.target.value)}
                disabled={filteredSongs.length === 0}
              >
                {filteredSongs.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => addSongWithRating("A")}
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition disabled:opacity-50"
                  disabled={!selectedSong}
                >
                  A：よく知っている
                </button>
                <button
                  onClick={() => addSongWithRating("B")}
                  className="px-3 py-2 bg-blue-500 text-white rounded-lg shadow hover:bg-blue-600 transition disabled:opacity-50"
                  disabled={!selectedSong}
                >
                  B：聞いたことがある
                </button>
                <button
                  onClick={() => addSongWithRating("C")}
                  className="px-3 py-2 bg-blue-400 text-white rounded-lg shadow hover:bg-blue-500 transition disabled:opacity-50"
                  disabled={!selectedSong}
                >
                  C：うろ覚え
                </button>
                <button
                  onClick={passSong}
                  className="px-3 py-2 bg-gray-500 text-white rounded-lg shadow hover:bg-gray-600 transition disabled:opacity-50"
                  disabled={!selectedSong}
                  title="追加せず次へ"
                >
                  パス
                </button>
              </div>
            </div>

            {filteredSongs.length === 0 && (
              <div className="text-sm text-gray-700">
                検索に一致する候補がありません（検索語を消すか、data.json に候補を追加）
              </div>
            )}
          </>
        )}
      </div>

      {/* 登録曲一覧（検索） */}
      <div className="bg-white p-3 rounded-lg shadow flex flex-col gap-2">
        <div className="flex flex-col md:flex-row gap-2 md:items-center">
          <h2 className="font-semibold text-gray-900">🎶 登録曲一覧</h2>
          <input
            className="md:ml-auto p-2 rounded-lg border text-gray-900"
            placeholder="登録曲を検索（曲名/アーティスト）"
            value={mySongSearch}
            onChange={(e) => setMySongSearch(e.target.value)}
          />
        </div>

        <ul className="flex flex-col gap-1">
          {filteredMySongs.map((s) => (
            <li
              key={s.key}
              className="flex justify-between items-center p-1 rounded hover:bg-gray-100"
            >
              <div>
                <span className="font-bold text-gray-900">{s.name}</span> -{" "}
                <span className="text-gray-700">{s.artist}</span> (
                <span className="text-purple-700 font-semibold">
                  {s.rating} ({ratingToPoint(s.rating)}pt)
                </span>
                )
              </div>
              <button onClick={() => deleteSong(s.key)} className="text-red-500 font-bold px-2">
                ❌
              </button>
            </li>
          ))}
        </ul>

        {filteredMySongs.length === 0 && (
          <div className="text-sm text-gray-700">検索に一致する登録曲がありません</div>
        )}
      </div>

      <button
        onClick={goToRoom}
        className="mt-1 px-4 py-2 bg-green-500 text-white rounded-lg shadow hover:bg-green-600 transition"
      >
        ➕ 新しいルームを作る
      </button>
    </main>
  );
}
