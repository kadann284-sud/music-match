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

// ランク判定
function getRank(points: number) {
  if (points >= 1000) return "💎 ダイヤ";
  if (points >= 301) return "🏆 プラチナ";
  if (points >= 101) return "🥇 ゴールド";
  if (points >= 51) return "🥈 シルバー";
  return "🥉 ブロンズ";
}

// 評価→ポイント
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

function normalizeSong(name: string, artist: string) {
  return (name + "_" + artist)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s\p{Punctuation}]/gu, "");
}

// 検索用：ゆらぎ吸収（簡易）
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
  const [rating, setRating] = useState<Rating>("A");

  // ★追加：曲名検索
  const [songSearch, setSongSearch] = useState<string>("");

  const [userId, setUserId] = useState<string | null>(null);

  // localStorage userId
  useEffect(() => {
    const id = localStorage.getItem("userId");
    if (!id) {
      router.push("/login");
      return;
    }
    setUserId(id);
  }, [router]);

  // data.json 読み込み
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

  // Firestore からユーザー取得
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

  // アーティスト変更時：曲を先頭に
  useEffect(() => {
    if (!catalog) return;
    const a = catalog.artists.find((x) => x.name === selectedArtist);
    const first = a?.songs?.[0] ?? "";
    setSelectedSong(first);
    // 検索もリセットしたいなら↓（好み）
    // setSongSearch("");
  }, [selectedArtist, catalog]);

  // アーティストの曲リスト（検索で絞る）
  const filteredSongs = useMemo(() => {
    if (!catalog) return [];
    const base = catalog.artists.find((a) => a.name === selectedArtist)?.songs ?? [];
    const q = normalizeForSearch(songSearch.trim());
    if (!q) return base;
    return base.filter((title) => normalizeForSearch(title).includes(q));
  }, [catalog, selectedArtist, songSearch]);

  // 検索結果が変わったら「選択曲」を先頭に合わせる（候補0なら空）
  useEffect(() => {
    if (filteredSongs.length === 0) {
      setSelectedSong("");
      return;
    }
    // 今選んでいる曲が候補に残っているなら維持、なければ先頭へ
    if (!selectedSong || !filteredSongs.includes(selectedSong)) {
      setSelectedSong(filteredSongs[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredSongs]);

  async function addSong() {
    if (!currentUser) return;
    if (!selectedArtist || !selectedSong) return;

    const key = normalizeSong(selectedSong, selectedArtist);
    if (songs.some((s) => s.key === key)) return;

    const newSong: Song = {
      name: selectedSong,
      artist: selectedArtist,
      key,
      rating,
    };

    const updated = { ...currentUser, songs: [...songs, newSong] };
    await setDoc(doc(db, "users", currentUser.id), updated);
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

      {/* 追加：検索つき選択式 */}
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
                placeholder="曲名で検索（例：レモン / Lemon）"
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

              <select
                className="p-2 rounded-lg border text-gray-900"
                value={rating}
                onChange={(e) => setRating(e.target.value as Rating)}
              >
                <option value="A">A：よく知ってる（3pt）</option>
                <option value="B">B：聞いたことある（2pt）</option>
                <option value="C">C：名前だけ知ってる／うろ覚え（1pt）</option>
              </select>

              <button
                onClick={addSong}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg shadow hover:bg-blue-600 transition disabled:opacity-50"
                disabled={!selectedSong}
              >
                追加
              </button>
            </div>

            {filteredSongs.length === 0 && (
              <div className="text-sm text-gray-700">
                検索に一致する曲がありません（検索語を消すか、data.json に候補を追加してください）
              </div>
            )}
          </>
        )}
      </div>

      {/* 曲リスト */}
      <div className="bg-white p-3 rounded-lg shadow flex flex-col gap-2">
        <h2 className="font-semibold text-gray-900">🎶 登録曲一覧</h2>
        <ul className="flex flex-col gap-1">
          {songs.map((s) => (
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
