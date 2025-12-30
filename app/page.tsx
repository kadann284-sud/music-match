"use client"; // クライアントサイド専用にする

import { useEffect, useState } from "react";

interface Song {
  name: string;
  artist: string;
  rank: "A" | "B" | "C"; // 3段階評価
}

export default function Home() {
  const [songs, setSongs] = useState<Song[]>([]);
  const [songName, setSongName] = useState("");
  const [artistName, setArtistName] = useState("");
  const [rank, setRank] = useState<"A" | "B" | "C">("A");

  // localStorage から読み込む
  useEffect(() => {
    const savedSongs = localStorage.getItem("songs");
    if (savedSongs) setSongs(JSON.parse(savedSongs));
  }, []);

  // 曲を保存する関数
  const addSong = () => {
    if (!songName.trim()) return;

    // 重複登録防止（曲名 + アーティスト）
    if (
      songs.some(
        (s) =>
          s.name.toLowerCase().trim() === songName.toLowerCase().trim() &&
          s.artist.toLowerCase().trim() === artistName.toLowerCase().trim()
      )
    ) {
      alert("すでに登録されています");
      return;
    }

    const newSong: Song = { name: songName.trim(), artist: artistName.trim(), rank };
    const updatedSongs = [...songs, newSong];
    setSongs(updatedSongs);
    localStorage.setItem("songs", JSON.stringify(updatedSongs));
    setSongName("");
    setArtistName("");
    setRank("A");
  };

  // 曲を削除
  const deleteSong = (index: number) => {
    const updatedSongs = songs.filter((_, i) => i !== index);
    setSongs(updatedSongs);
    localStorage.setItem("songs", JSON.stringify(updatedSongs));
  };

  // ランクポイント計算
  const getRankPoints = (s: Song) => {
    switch (s.rank) {
      case "A":
        return 3;
      case "B":
        return 2;
      case "C":
        return 1;
    }
  };

  const totalPoints = songs.reduce((acc, s) => acc + getRankPoints(s), 0);

  const getUserRank = () => {
    if (totalPoints >= 1000) return "ダイヤ";
    if (totalPoints >= 301) return "プラチナ";
    if (totalPoints >= 101) return "ゴールド";
    if (totalPoints >= 51) return "シルバー";
    return "ブロンズ";
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <h1 className="text-3xl font-bold text-gray-800 mb-4">Music Match</h1>

      <div className="mb-6">
        <input
          className="p-2 border rounded mr-2"
          placeholder="曲名"
          value={songName}
          onChange={(e) => setSongName(e.target.value)}
        />
        <input
          className="p-2 border rounded mr-2"
          placeholder="アーティスト名"
          value={artistName}
          onChange={(e) => setArtistName(e.target.value)}
        />
        <select
          className="p-2 border rounded mr-2"
          value={rank}
          onChange={(e) => setRank(e.target.value as "A" | "B" | "C")}
        >
          <option value="A">よく知ってる</option>
          <option value="B">聞いたことある</option>
          <option value="C">名前だけ知ってる／うろ覚え</option>
        </select>
        <button
          className="px-4 py-2 bg-blue-500 text-white rounded"
          onClick={addSong}
        >
          追加
        </button>
      </div>

      <h2 className="text-xl font-semibold text-gray-700 mb-2">
        登録曲 ({songs.length} 曲)
      </h2>
      <ul className="mb-6">
        {songs.map((s, i) => (
          <li
            key={i}
            className="flex justify-between items-center bg-white p-2 mb-1 rounded shadow-sm"
          >
            <span className="text-gray-800">
              {s.name} - {s.artist} ({s.rank})
            </span>
            <button
              className="text-red-500 font-bold"
              onClick={() => deleteSong(i)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <div className="bg-white p-4 rounded shadow-sm">
        <p className="text-gray-800 font-semibold">
          総ポイント: {totalPoints} ポイント
        </p>
        <p className="text-gray-800 font-semibold">ランク: {getUserRank()}</p>
      </div>
    </div>
  );
}
