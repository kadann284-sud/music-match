"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  deleteDoc,
} from "firebase/firestore";

type Rating = "A" | "B" | "C";
type Song = { name: string; artist: string; key: string; rating: Rating };
type User = { id: string; name: string; songs: Song[] };

type Catalog = {
  artists: { name: string; songs: string[] }[];
};

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [roomMembers, setRoomMembers] = useState<string[]>([]);

  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  // ★data.json（割合表示に必要）
  const [catalog, setCatalog] = useState<Catalog | null>(null);

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
    })();
  }, []);

  useEffect(() => {
    setUrl(window.location.href);
  }, []);

  async function copyUrl() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // room 参加
  useEffect(() => {
    if (!roomId || !userId) return;

    const roomRef = doc(db, "rooms", roomId);

    (async () => {
      const roomSnap = await getDoc(roomRef);
      if (roomSnap.exists()) {
        const members: string[] = roomSnap.data().members || [];
        if (!members.includes(userId)) {
          const next = [...members, userId];
          await updateDoc(roomRef, { members: next });
          setRoomMembers(next);
        } else {
          setRoomMembers(members);
        }
      } else {
        await setDoc(roomRef, { members: [userId] });
        setRoomMembers([userId]);
      }
    })();
  }, [roomId, userId]);

  // users リアルタイム取得
  useEffect(() => {
    if (roomMembers.length === 0) {
      setUsers([]);
      return;
    }

    const unsub = onSnapshot(collection(db, "users"), (snapshot) => {
      const list: User[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as any;
        if (data && roomMembers.includes(docSnap.id)) {
          list.push({ id: docSnap.id, name: data.name, songs: data.songs || [] });
        }
      });

      list.sort((a, b) => roomMembers.indexOf(a.id) - roomMembers.indexOf(b.id));
      setUsers(list);
    });

    return () => unsub();
  }, [roomMembers]);

  const currentUser = useMemo(
    () => users.find((u) => u.id === userId) ?? null,
    [users, userId]
  );

  const commonKeys = useMemo(() => {
    if (users.length < 2) return [];
    const keysList = users.map((u) => u.songs.map((s) => s.key));
    return keysList.reduce((a, b) => a.filter((k) => b.includes(k)));
  }, [users]);

  const keyToSong = useMemo(() => {
    const map = new Map<string, Song>();
    for (const u of users) {
      for (const s of u.songs) {
        if (!map.has(s.key)) map.set(s.key, s);
      }
    }
    return map;
  }, [users]);

  // ★ルーム参加者全体の「知ってる％」（アーティスト別）
  const roomArtistStats = useMemo(() => {
    if (!catalog) return [];

    // 参加者が知ってる曲key（artist別にユニークカウント）
    const knownKeysByArtist = new Map<string, Set<string>>();
    for (const u of users) {
      for (const s of u.songs) {
        if (!knownKeysByArtist.has(s.artist)) knownKeysByArtist.set(s.artist, new Set());
        knownKeysByArtist.get(s.artist)!.add(s.key);
      }
    }

    return catalog.artists
      .map((a) => {
        const total = a.songs.length;
        const known = knownKeysByArtist.get(a.name)?.size ?? 0;
        const percent = total > 0 ? Math.round((known / total) * 100) : 0;
        return { artist: a.name, known, total, percent };
      })
      .sort((x, y) => y.percent - x.percent);
  }, [catalog, users]);

  function logout() {
    localStorage.removeItem("userId");
    router.push("/login");
  }

  async function deleteAccount() {
    if (!currentUser) return;
    const ok = confirm("本当にアカウントを削除しますか？この操作は戻せません。");
    if (!ok) return;

    await deleteDoc(doc(db, "users", currentUser.id));

    const roomRef = doc(db, "rooms", roomId);
    const roomSnap = await getDoc(roomRef);
    if (roomSnap.exists()) {
      const members: string[] = roomSnap.data().members || [];
      await updateDoc(roomRef, { members: members.filter((id) => id !== currentUser.id) });
    }

    localStorage.removeItem("userId");
    router.push("/login");
  }

  return (
    <main className="min-h-screen p-4 bg-gray-100 flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-center text-gray-900">🎵 Music Match - ルーム</h1>

      {/* ★ホームへ戻る */}
      <button
        onClick={() => router.push("/")}
        className="px-4 py-2 bg-indigo-600 text-white rounded-lg shadow hover:bg-indigo-700 transition"
      >
        🏠 ホームへ戻る
      </button>

      {currentUser && (
        <div className="bg-gray-200 p-2 rounded-lg text-gray-900 font-semibold text-center">
          ユーザー名: <span className="text-blue-700">{currentUser.name}</span> | UserID:{" "}
          <span className="text-green-700">{currentUser.id}</span>
        </div>
      )}

      <div className="bg-white p-3 rounded-lg shadow flex flex-col gap-2">
        <span className="font-semibold text-gray-900">共有URL</span>
        <div className="break-words text-blue-700 font-medium">{url}</div>
        <button
          onClick={copyUrl}
          className="mt-1 px-4 py-2 bg-blue-500 text-white rounded-lg shadow hover:bg-blue-600 transition"
        >
          📋 URLコピー
        </button>
        {copied && <span className="text-green-600 font-medium mt-1">コピーしました！</span>}
      </div>

      <div className="flex gap-2">
        <button
          onClick={logout}
          className="px-4 py-2 bg-gray-500 text-white rounded-lg shadow hover:bg-gray-600 transition"
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

      {/* ★アーティスト別 知ってる％（ルーム全体） */}
      <div className="bg-white p-3 rounded-lg shadow flex flex-col gap-2">
        <h2 className="font-semibold text-gray-900">📊 ルーム全体：アーティスト別 知ってる％</h2>
        {!catalog ? (
          <div className="text-gray-700">読み込み中...</div>
        ) : (
          <div className="flex flex-col gap-1">
            {roomArtistStats.map((a) => (
              <div
                key={a.artist}
                className="flex items-center justify-between rounded-lg px-2 py-2 bg-gray-50"
              >
                <div className="text-gray-900 font-semibold">{a.artist}</div>
                <div className="text-gray-800">
                  <span className="font-bold">{a.percent}%</span>{" "}
                  <span className="text-gray-600">({a.known}/{a.total})</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ユーザー曲 */}
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
                  <div className="text-gray-900">
                    <span className="font-semibold">{s.name}</span>{" "}
                    <span className="text-gray-700">- {s.artist}</span>{" "}
                    <span className="text-purple-700 font-semibold">
                      ({s.rating} / {s.rating === "A" ? "3" : s.rating === "B" ? "2" : "1"}pt)
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* 共通曲 */}
      <div className="bg-white p-3 rounded-lg shadow mt-2">
        <h2 className="font-semibold text-lg text-gray-900 mb-2">🎯 共通曲</h2>

        {commonKeys.length === 0 ? (
          <div className="text-gray-700">共通曲はまだありません（2人以上・登録が必要）</div>
        ) : (
          <ul className="flex flex-col gap-1">
            {commonKeys.map((k) => {
              const s = keyToSong.get(k);
              return (
                <li key={k} className="text-gray-900">
                  <span className="font-semibold">{s?.name ?? "?"}</span>{" "}
                  <span className="text-gray-700">- {s?.artist ?? ""}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
