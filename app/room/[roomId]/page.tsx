'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
} from 'firebase/firestore';

type Song = { name: string; key: string };
type User = { id: string; name: string; songs: Song[] };

function normalizeSong(name: string) {
  return name.toLowerCase().normalize('NFKC').replace(/[\s\p{Punctuation}]/gu, '');
}

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [roomMembers, setRoomMembers] = useState<string[]>([]);
  const [newSong, setNewSong] = useState('');
  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);

  const userId = localStorage.getItem('userId');
  const currentUser = users.find((u) => u.id === userId);

  // room 参加・members state
  useEffect(() => {
    if (!roomId || !userId) return;
    const roomRef = doc(db, 'rooms', roomId);

    getDoc(roomRef).then((roomSnap) => {
      if (roomSnap.exists()) {
        const members: string[] = roomSnap.data().members || [];
        if (!members.includes(userId)) {
          updateDoc(roomRef, { members: [...members, userId] });
          setRoomMembers([...members, userId]);
        } else {
          setRoomMembers(members);
        }
      } else {
        setDoc(roomRef, { members: [userId] });
        setRoomMembers([userId]);
      }
    });
  }, [roomId, userId]);

  // ユーザー情報リアルタイム取得
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      const list: User[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (data && roomMembers.includes(docSnap.id)) {
          list.push({ id: docSnap.id, name: data.name, songs: data.songs || [] });
        }
      });
      setUsers(list);
    });
    return () => unsub();
  }, [roomMembers]);

  // URLコピー
  useEffect(() => {
    setUrl(window.location.href);
  }, []);

  async function addSong() {
    if (!currentUser || !newSong) return;

    const key = normalizeSong(newSong);
    if (currentUser.songs.some((s) => s.key === key)) return;

    const updated = { ...currentUser, songs: [...currentUser.songs, { name: newSong, key }] };
    await setDoc(doc(db, 'users', currentUser.id), updated);
    setNewSong('');
  }

  async function deleteSong(songKey: string) {
    if (!currentUser) return;
    const updated = { ...currentUser, songs: currentUser.songs.filter((s) => s.key !== songKey) };
    await setDoc(doc(db, 'users', currentUser.id), updated);
  }

  function getCommonSongs() {
    if (users.length < 2) return [];
    return users
      .map((u) => u.songs.map((s) => s.key))
      .reduce((a, b) => a.filter((k) => b.includes(k)));
  }

  async function copyUrl() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // ログアウト
  function logout() {
    localStorage.removeItem('userId');
    router.push('/login');
  }

  // アカウント削除
  async function deleteAccount() {
    if (!currentUser) return;
    const confirmed = confirm('本当にアカウントを削除しますか？この操作は戻せません。');
    if (!confirmed) return;

    // Firestore から削除
    await deleteDoc(doc(db, 'users', currentUser.id));

    // ルームから削除
    const roomRef = doc(db, 'rooms', roomId);
    const roomSnap = await getDoc(roomRef);
    if (roomSnap.exists()) {
      const members: string[] = roomSnap.data().members || [];
      await updateDoc(roomRef, { members: members.filter((id) => id !== currentUser.id) });
    }

    // localStorage から削除してログイン画面へ
    localStorage.removeItem('userId');
    router.push('/login');
  }

  return (
    <main className="min-h-screen p-4 bg-gray-100 flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-center text-gray-900">🎵 Music Match - ルーム</h1>

      {/* 現在ログイン中ユーザー情報 */}
      {currentUser && (
        <div className="bg-gray-200 p-2 rounded-lg text-gray-900 font-semibold text-center">
          ユーザー名: <span className="text-blue-700">{currentUser.name}</span> |
          UserID: <span className="text-green-700">{currentUser.id}</span>
        </div>
      )}

      {/* URLコピー */}
      <div className="bg-white p-3 rounded-lg shadow flex flex-col gap-2">
        <span className="font-semibold text-gray-900">共有URL</span>
        <div className="break-words text-blue-700 font-medium">{url}</div>
        <button
          onClick={copyUrl}
          className="mt-2 px-4 py-2 bg-blue-500 text-white rounded-lg shadow hover:bg-blue-600 transition"
        >
          📋 URLコピー
        </button>
        {copied && <span className="text-green-600 font-medium mt-1">コピーしました！</span>}
      </div>

      {/* ログアウト / アカウント削除 */}
      <div className="flex gap-2">
        <button
          onClick={logout}
          className="px-4 py-2 bg-gray-400 text-white rounded-lg shadow hover:bg-gray-500 transition"
        >
          ログアウト
        </button>
        <button
          onClick={deleteAccount}
          className="px-4 py-2 bg-red-500 text-white rounded-lg shadow hover:bg-red-600 transition"
        >
          アカウント削除
        </button>
      </div>

      {/* 曲追加 */}
      {currentUser && (
        <div className="flex gap-2">
          <input
            className="flex-1 p-2 rounded-lg border text-gray-900"
            placeholder="曲名"
            value={newSong}
            onChange={(e) => setNewSong(e.target.value)}
          />
          <button
            onClick={addSong}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg shadow hover:bg-blue-600 transition"
          >
            追加
          </button>
        </div>
      )}

      {/* ユーザーごとの曲リスト */}
      <div className="flex flex-col gap-4">
        {users.map((u) => (
          <div key={u.id} className="bg-white p-3 rounded-lg shadow flex flex-col gap-2">
            <span className="font-bold text-gray-900">{u.name}</span>
            <ul className="flex flex-col gap-1">
              {u.songs.map((s) => (
                <li
                  key={s.key}
                  className="flex justify-between items-center p-1 rounded hover:bg-gray-100"
                >
                  <span className="text-gray-900">{s.name}</span>
                  {u.id === userId && (
                    <button
                      onClick={() => deleteSong(s.key)}
                      className="text-red-500 font-bold px-2"
                    >
                      ❌
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* 共通曲 */}
      <div className="bg-white p-3 rounded-lg shadow mt-4">
        <h2 className="font-semibold text-lg text-gray-900 mb-2">🎯 共通曲</h2>
        <ul className="flex flex-col gap-1">
          {getCommonSongs().map((k) => {
            const song = users[0]?.songs.find((s) => s.key === k);
            return <li key={k} className="text-gray-900">{song?.name}</li>;
          })}
        </ul>
      </div>
    </main>
  );
}
