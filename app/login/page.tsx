'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { doc, setDoc, getDoc } from 'firebase/firestore';

export default function LoginPage() {
  const [name, setName] = useState('');
  const [userId, setUserId] = useState('');
  const router = useRouter();

  async function loginOrCreate() {
    if (!name) return;
    let id = userId;
    if (!id) {
      id = crypto.randomUUID();
      await setDoc(doc(db, 'users', id), { name, songs: [] });
    } else {
      const snap = await getDoc(doc(db, 'users', id));
      if (!snap.exists()) {
        await setDoc(doc(db, 'users', id), { name, songs: [] });
      }
    }
    localStorage.setItem('userId', id);
    router.push('/');
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-100 p-4">
      <h1 className="text-3xl font-bold text-gray-900">🎵 Music Match</h1>
      <input
        className="p-2 rounded-lg border text-gray-900 w-full max-w-xs"
        placeholder="ユーザー名"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        className="p-2 rounded-lg border text-gray-900 w-full max-w-xs"
        placeholder="（既存ユーザーならID）"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
      />
      <button
        onClick={loginOrCreate}
        className="px-6 py-2 bg-blue-500 text-white rounded-lg shadow hover:bg-blue-600 transition"
      >
        ログイン / アカウント作成
      </button>
    </main>
  );
}
