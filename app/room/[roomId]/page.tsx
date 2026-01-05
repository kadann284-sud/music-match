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

type SongRow = { key: string; name: string; artist: string; byUser: Record<string, Rating> };

type Counts = { A: number; B: number; C: number };
function emptyCounts(): Counts {
  return { A: 0, B: 0, C: 0 };
}
function imbalance(c: Counts) {
  const mx = Math.max(c.A, c.B, c.C);
  const mn = Math.min(c.A, c.B, c.C);
  return mx - mn;
}

export default function RoomPage() {
  const { roomId } = useParams<{ roomId: string }>();
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [roomMembers, setRoomMembers] = useState<string[]>([]);

  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  // 生成したプレイリスト
  const [playlist, setPlaylist] = useState<SongRow[]>([]);
  const [playlistMode, setPlaylistMode] = useState<"raw" | "balanced" | "">("");

  useEffect(() => {
    const id = localStorage.getItem("userId");
    if (!id) {
      router.push("/login");
      return;
    }
    setUserId(id);
  }, [router]);

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

  // userId -> 表示名
  const userNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users) m.set(u.id, u.name);
    return m;
  }, [users]);

  // 共通曲キー
  const commonKeys = useMemo(() => {
    if (users.length < 2) return [];
    const keysList = users.map((u) => u.songs.map((s) => s.key));
    return keysList.reduce((a, b) => a.filter((k) => b.includes(k)));
  }, [users]);

  // key -> {name, artist}（代表）
  const keyToSong = useMemo(() => {
    const map = new Map<string, Song>();
    for (const u of users) {
      for (const s of u.songs) {
        if (!map.has(s.key)) map.set(s.key, s);
      }
    }
    return map;
  }, [users]);

  // 共通曲の「ユーザー別評価」を集計した行データ
  const commonRows: SongRow[] = useMemo(() => {
    if (users.length < 2) return [];
    const userIds = users.map((u) => u.id);

    // userId -> (key -> rating)
    const ratingMapByUser = new Map<string, Map<string, Rating>>();
    for (const u of users) {
      const m = new Map<string, Rating>();
      for (const s of u.songs) m.set(s.key, s.rating);
      ratingMapByUser.set(u.id, m);
    }

    const rows: SongRow[] = [];
    for (const key of commonKeys) {
      const rep = keyToSong.get(key);
      if (!rep) continue;

      const byUser: Record<string, Rating> = {};
      let ok = true;
      for (const uid of userIds) {
        const r = ratingMapByUser.get(uid)?.get(key);
        if (!r) {
          ok = false;
          break;
        }
        byUser[uid] = r;
      }
      if (!ok) continue;

      rows.push({ key, name: rep.name, artist: rep.artist, byUser });
    }

    // 表示を安定させたいので、曲名→アーティストでソート
    rows.sort((a, b) => (a.name + a.artist).localeCompare(b.name + b.artist, "ja"));
    return rows;
  }, [users, commonKeys, keyToSong]);

  // プレイリストのユーザー別 A/B/C 内訳
  const playlistCountsByUser = useMemo(() => {
    const map = new Map<string, Counts>();
    for (const u of users) map.set(u.id, emptyCounts());

    for (const row of playlist) {
      for (const uid of Object.keys(row.byUser)) {
        const c = map.get(uid);
        if (!c) continue;
        const r = row.byUser[uid];
        c[r] += 1;
      }
    }
    return map;
  }, [playlist, users]);

  function allUsersImbalanceMax(rows: SongRow[]) {
    const tmp = new Map<string, Counts>();
    for (const u of users) tmp.set(u.id, emptyCounts());
    for (const row of rows) {
      for (const uid of Object.keys(row.byUser)) {
        tmp.get(uid)![row.byUser[uid]] += 1;
      }
    }
    let mx = 0;
    for (const u of users) {
      mx = Math.max(mx, imbalance(tmp.get(u.id)!));
    }
    return mx;
  }

  // ✅ ボタン1：そのまま（全共通曲）
  function buildRawPlaylist() {
    setPlaylist(commonRows);
    setPlaylistMode("raw");
  }

  // ✅ ボタン2：均等化（上限なし）…「差最大1」になるまで削る（可能な範囲で）
  function buildBalancedPlaylist() {
    // ベースは全共通曲
    let rows = [...commonRows];
    setPlaylistMode("balanced");

    if (users.length < 2 || rows.length === 0) {
      setPlaylist(rows);
      return;
    }

    // userId -> counts
    const counts = new Map<string, Counts>();
    for (const u of users) counts.set(u.id, emptyCounts());

    // 初期カウント
    for (const row of rows) {
      for (const uid of Object.keys(row.byUser)) {
        counts.get(uid)![row.byUser[uid]] += 1;
      }
    }

    const userIds = users.map((u) => u.id);

    // ループ：全員の imbalance が 1 以下になれば終了
    // ただし、削りすぎ防止 & 無限ループ防止で上限も置く
    let guard = 0;
    const maxIter = Math.max(5000, rows.length * 20);

    function maxImb() {
      let m = 0;
      for (const uid of userIds) m = Math.max(m, imbalance(counts.get(uid)!));
      return m;
    }

    // 「偏っている評価」を減らす曲を選んで削る（貪欲）
    while (rows.length > 0 && maxImb() > 1 && guard < maxIter) {
      guard++;

      // 今一番 imbalance が大きいユーザーを見つける
      let worstUid = userIds[0];
      let worstImb = -1;
      for (const uid of userIds) {
        const im = imbalance(counts.get(uid)!);
        if (im > worstImb) {
          worstImb = im;
          worstUid = uid;
        }
      }
      const cWorst = counts.get(worstUid)!;

      // worstユーザーで一番多い評価（A/B/C）を探す
      const maxVal = Math.max(cWorst.A, cWorst.B, cWorst.C);
      const heavyRatings: Rating[] = (["A", "B", "C"] as Rating[]).filter(
        (r) => cWorst[r] === maxVal
      );

      // 削る候補をスコア化：
      //  - worstユーザーの heavyRating を減らせるならプラス
      //  - 他ユーザーの imbalance を悪化させにくい曲を優先
      let bestIdx = -1;
      let bestScore = -Infinity;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];

        // worstユーザーの偏りを減らせない曲は基本弱い
        const rw = row.byUser[worstUid];
        let score = 0;

        // worstの heavyRating を減らせるなら大きく加点
        if (heavyRatings.includes(rw)) score += 5;

        // “削ると imbalance が改善するか/悪化するか” を全ユーザーで見る
        // 近似：削除後の imbalance の変化を合計（改善=加点、悪化=減点）
        for (const uid of userIds) {
          const before = imbalance(counts.get(uid)!);
          // 仮に1つ減らす
          const r = row.byUser[uid];
          const c = counts.get(uid)!;
          const afterCounts: Counts = { A: c.A, B: c.B, C: c.C };
          afterCounts[r] = Math.max(0, afterCounts[r] - 1);
          const after = imbalance(afterCounts);

          score += (before - after) * 2; // 改善(+)/悪化(-)
        }

        // なるべく曲数を多く残したいので、同点なら「削った後も改善幅が大きいもの」優先
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      if (bestIdx === -1) break;

      // bestIdx の曲を削除
      const removed = rows.splice(bestIdx, 1)[0];
      for (const uid of userIds) {
        const r = removed.byUser[uid];
        counts.get(uid)![r] = Math.max(0, counts.get(uid)![r] - 1);
      }
    }

    setPlaylist(rows);
  }

  async function copyPlaylist() {
    if (playlist.length === 0) return;
    const text = playlist.map((s) => `${s.name} - ${s.artist}`).join("\n");
    await navigator.clipboard.writeText(text);
  }

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

  const maxImbNow = useMemo(() => {
    if (playlist.length === 0 || users.length === 0) return 0;
    return allUsersImbalanceMax(playlist);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlist, users.length]);

  return (
    <main className="min-h-screen p-4 bg-gray-100 flex flex-col gap-4">
      <h1 className="text-2xl font-bold text-center text-gray-900">🎵 Music Match - ルーム</h1>

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

      {/* 共通曲一覧 */}
      <div className="bg-white p-3 rounded-lg shadow">
        <h2 className="font-semibold text-lg text-gray-900 mb-2">
          🎯 共通曲（{commonRows.length}曲）
        </h2>

        {commonRows.length === 0 ? (
          <div className="text-gray-700">共通曲はまだありません（2人以上・登録が必要）</div>
        ) : (
          <div className="text-gray-700 text-sm">
            この共通曲からプレイリストを生成できます。
          </div>
        )}

        {/* ★ボタン2つ */}
        <div className="mt-3 flex flex-col md:flex-row gap-2">
          <button
            onClick={buildRawPlaylist}
            className="px-4 py-2 bg-emerald-600 text-white rounded-lg shadow hover:bg-emerald-700 transition disabled:opacity-50"
            disabled={commonRows.length === 0}
          >
            ✅ そのまま共通曲プレイリスト作成（全件）
          </button>

          <button
            onClick={buildBalancedPlaylist}
            className="px-4 py-2 bg-orange-600 text-white rounded-lg shadow hover:bg-orange-700 transition disabled:opacity-50"
            disabled={commonRows.length === 0}
            title="ユーザー別A/B/Cの偏り（最大-最小）をできるだけ小さくするために、必要最小限だけ曲を削ります"
          >
            ⚖️ 均等化プレイリスト作成（上限なし）
          </button>
        </div>
      </div>

      {/* 生成結果 */}
      <div className="bg-white p-3 rounded-lg shadow flex flex-col gap-2">
        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <h2 className="font-semibold text-gray-900">
            🎧 生成プレイリスト{" "}
            {playlistMode === "raw"
              ? "（そのまま）"
              : playlistMode === "balanced"
              ? "（均等化）"
              : ""}
          </h2>

          <div className="md:ml-auto flex gap-2">
            <button
              onClick={copyPlaylist}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition disabled:opacity-50"
              disabled={playlist.length === 0}
            >
              📋 曲名リストをコピー
            </button>
          </div>
        </div>

        <div className="text-gray-700 text-sm">
          曲数: <span className="font-semibold text-gray-900">{playlist.length}</span>
          {playlistMode === "balanced" && (
            <>
              {" "}
              / 偏り(max-min) 最大:{" "}
              <span className="font-semibold text-gray-900">{maxImbNow}</span>
              <span className="text-gray-500">（目標は1以下）</span>
            </>
          )}
        </div>

        {playlist.length === 0 ? (
          <div className="text-gray-700">まだ生成されていません。</div>
        ) : (
          <ul className="flex flex-col gap-1">
            {playlist.map((s) => (
              <li key={s.key} className="p-2 rounded bg-gray-50">
                <div className="text-gray-900 font-semibold">
                  {s.name} <span className="text-gray-600 font-normal">- {s.artist}</span>
                </div>

                {/* ユーザー別評価 */}
                <div className="text-sm text-gray-700 mt-1 flex flex-wrap gap-2">
                  {Object.entries(s.byUser).map(([uid, r]) => (
                    <span key={uid} className="px-2 py-0.5 rounded bg-white border">
                      {userNameById.get(uid) ?? uid}:{" "}
                      <span className="font-semibold text-gray-900">{r}</span>
                      <span className="text-gray-500">（w={ratingWeight(r)}）</span>
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ユーザー別 内訳 */}
      <div className="bg-white p-3 rounded-lg shadow flex flex-col gap-2">
        <h2 className="font-semibold text-gray-900">📌 ユーザー別 A/B/C 内訳（生成プレイリスト）</h2>
        {playlist.length === 0 ? (
          <div className="text-gray-700">プレイリスト生成後に表示されます。</div>
        ) : (
          <div className="flex flex-col gap-2">
            {users.map((u) => {
              const c = playlistCountsByUser.get(u.id) ?? emptyCounts();
              return (
                <div key={u.id} className="bg-gray-50 rounded-lg p-2 flex justify-between">
                  <div className="text-gray-900 font-semibold">{u.name}</div>
                  <div className="text-gray-800">
                    A:{c.A} / B:{c.B} / C:{c.C}{" "}
                    <span className="text-gray-500">
                      （偏り {imbalance(c)}）
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 参考：各ユーザー曲 */}
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
                      ({s.rating} / {ratingToPoint(s.rating)}pt)
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </main>
  );
}
