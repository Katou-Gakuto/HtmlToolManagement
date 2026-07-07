// ==== 【検証：システム起動とモックデータの注入】 ====
const vfs = new FileVirtualizer(sysEventBus);
const sequencer = new ActionSequencer(sysEventBus, vfs);

// 1. システム初期化（Rootフォルダ生成）
const rootId = vfs.initEmptySystem("マイコンピュータ");

// 2. フォルダ構造の生成（通常、整理先、削除神殿）
const docFolderId = vfs.createFolder("Documents", rootId, "Normal");
const organizeFolderId = vfs.createFolder("2026年写真整理", rootId, "Organize");
const deleteTempleId = vfs.createFolder("削除神殿", rootId, "Delete"); // Type: Delete

// 3. 混沌の未整理ファイルをDocuments配下にロード
const file1 = vfs.createFile("vacation_photo", "jpg", 2048500, "/user/docs/vacation_photo.jpg", docFolderId);
const file2 = vfs.createFile("malware_virus", "exe", 9999999, "/user/docs/malware_virus.exe", docFolderId);

console.log("--- 初期状態の検証 ---");
console.log("ファイル1の初期親ID:", vfs.getFile(file1).parentId === docFolderId ? "SUCCESS (Documents)" : "FAIL");

// ==== 【検証：履歴駆動アクションの発行】 ====
console.log("\n--- アクション実行の検証 ---");

// テストA: file1を「2026年写真整理」フォルダに移動（Move）
sequencer.pushAndExecute('Move', file1, { toFolderId: organizeFolderId });
console.log("Move実行後のファイル1の親ID:", vfs.getFile(file1).parentId === organizeFolderId ? "SUCCESS (Organize)" : "FAIL");
console.log("ファイル1にアクション履歴が刻印されているか:", vfs.getFile(file1).relatedActionIds.length === 1 ? "SUCCESS" : "FAIL");

// テストB: file2を「削除」操作に（Deleteタイプだが削除神殿へのMoveを内包）
sequencer.pushAndExecute('Delete', file2); 
console.log("Delete実行後のファイル2の親ID:", vfs.getFile(file2).parentId === deleteTempleId ? "SUCCESS (削除神殿へ自動内包移動)" : "FAIL");

// ==== 【検証：Undo / Redo のトランザクション制御】 ====
console.log("\n--- Undo / Redo の検証 ---");

// file2の削除を取り消し
sequencer.undo();
console.log("Undo後のファイル2の親ID:", vfs.getFile(file2).parentId === docFolderId ? "SUCCESS (Documentsへ帰還)" : "FAIL");
console.log("Undo後のアクションステータス:", sequencer.history[1].status === 'Reverted' ? "SUCCESS" : "FAIL");

// file2の削除をやり直し（Redo）
sequencer.redo();
console.log("Redo後のファイル2の親ID:", vfs.getFile(file2).parentId === deleteTempleId ? "SUCCESS (再び削除神殿へ)" : "FAIL");

// ==== 【検証：永続化シリアライズ】 ====
console.log("\n--- 永続化（JSON化）の検証 ---");
const jsonSaveData = PersistenceHandler.serialize(vfs, sequencer);
console.log("出力されたセーブデータの型:", typeof jsonSaveData === 'string' ? "SUCCESS (JSON文字列)" : "FAIL");
console.log("生データのプレフィックス整合性チェック (ファイル1のID):", file1.startsWith('file_') ? "SUCCESS" : "FAIL");