"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

type Song = { name: string; artist: string; key: string; rating: 'A' | 'B' | 'C' };
type User = { id: string; name: string; songs: Song[] };

// ランク判定
function getRank(points: number) {
  if (points >= 1000) return '💎 ダイヤ';
  if (points >= 301) return '🏆 プラチナ';
  if (points >= 101) return '🥇 ゴールド';
  if (points >= 51) return '🥈 シルバー';
  return '🥉 ブロンズ';
}

// 評価→ポイント変換
function ratingToPoint(rating: 'A'|'B'|'C') {
  switch (rating) {
    case 'A': return 3; // よく知ってる
    case 'B': return 2; // 聞いたことある
    case 'C': return 1; // 名前だけ知ってる／うろ覚え
  }
}

function normalizeSong(name: string, artist: string) {
  return (name + '_' + artist).toLowerCase().normalize('NFKC').replace(/[\s\p{Punctuation}]/gu, '');
}

export default function HomePage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [songs, setSongs] = useState<Song[]>([]);
  const [songName, setSongName] = useState('');
  const [artistName, setArtistName] = useState('');
  const [rating, setRating] = useState<'A'|'B'|'C'>('A');

  const userId = localStorage.getItem('userId');

  // ログインチェック・ユーザー取得
  useEffect(() => {
    if (!userId) {
      router.push('/login');
      return;
    }

    const unsub = onSnapshot(doc(db, 'users', userId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setCurrentUser({ id: snap.id, name: data.name, songs: data.songs || [] });
        setSongs(data.songs || []);
      }
    });

    return () => unsub();
  }, [userId, router]);

  async function addSong() {
    if (!currentUser || !songName || !artistName) return;

    const key = normalizeSong(songName, artistName);
    if (songs.some((s) => s.key === key)) return;

    const newSong: Song = { name: songName, artist: artistName, key, rating };
    const updated = { ...currentUser, songs: [...songs, newSong] };
    await setDoc(doc(db, 'users', currentUser.id), updated);

    setSongName('');
    setArtistName('');
    setRating('A');
  }

  async function deleteSong(songKey: string) {
    if (!currentUser) return;
    const updated = { ...currentUser, songs: songs.filter((s) => s.key !== songKey) };
    await setDoc(doc(db, 'users', currentUser.id), updated);
  }

  function goToRoom() {
    router.push(`/room/${crypto.randomUUID()}`);
  }

  // 総ポイント計算
  const totalPoints = songs.reduce((sum, s) => sum + ratingToPoint(s.rating), 0);
  const rank = getRank(totalPoints);

  return (
    <main className="min-h-screen p-4 bg-gray-100 flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-center text-gray-900">🎵 Music Match - ホーム</h1>

      {currentUser && (
        <div className="bg-gray-200 p-3 rounded-lg text-gray-900 font-semibold text-center">
          ユーザー名: <span className="text-blue-700">{currentUser.name}</span> |
          UserID: <span className="text-green-700">{currentUser.id}</span>
        </div>
      )}

      {/* 総ポイントとランク */}
      <div className="bg-white p-3 rounded-lg shadow text-center text-gray-900">
        総ポイント: <span className="font-bold text-purple-700">{totalPoints}</span> | ランク: <span className="font-bold text-yellow-600">{rank}</span>
      </div>

      {/* 曲追加フォーム */}
      <div className="flex flex-col md:flex-row gap-2">
        <input
          className="flex-1 p-2 rounded-lg border text-gray-900"
          placeholder="曲名"
          value={songName}
          onChange={(e) => setSongName(e.target.value)}
        />
        <input
          className="flex-1 p-2 rounded-lg border text-gray-900"
          placeholder="アーティスト名"
          value={artistName}
          onChange={(e) => setArtistName(e.target.value)}
        />
        <select
          className="p-2 rounded-lg border text-gray-900"
          value={rating}
          onChange={(e) => setRating(e.target.value as 'A'|'B'|'C')}
        >
          <option value="A">A：よく知ってる</option>
          <option value="B">B：聞いたことある</option>
          <option value="C">C：名前だけ知ってる／うろ覚え</option>
        </select>
        <button
          onClick={addSong}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg shadow hover:bg-blue-600 transition"
        >
          追加
        </button>
      </div>

      {/* 曲リスト */}
      <div className="bg-white p-3 rounded-lg shadow flex flex-col gap-2">
        <h2 className="font-semibold text-gray-900">🎶 登録曲一覧</h2>
        <ul className="flex flex-col gap-1">
          {songs.map((s) => (
            <li key={s.key} className="flex justify-between items-center p-1 rounded hover:bg-gray-100">
              <div>
                <span className="font-bold text-gray-900">{s.name}</span> -{' '}
                <span className="text-gray-700">{s.artist}</span> (
                <span className="text-purple-700 font-semibold">
                  {s.rating} ({ratingToPoint(s.rating)}pt)
                </span>)
              </div>
              <button
                onClick={() => deleteSong(s.key)}
                className="text-red-500 font-bold px-2"
              >
                ❌
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* ルーム作成ボタン */}
      <button
        onClick={goToRoom}
        className="mt-4 px-4 py-2 bg-green-500 text-white rounded-lg shadow hover:bg-green-600 transition"
      >
        ➕ 新しいルームを作る
      </button>
    </main>
  );
}
