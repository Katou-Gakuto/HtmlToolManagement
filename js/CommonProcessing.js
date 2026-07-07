/**
 * ============================================================================
 * PHASE 1: SHARED & CORE LOGIC BASE
 * FILE VIRTUALIZER & ACTION SEQUENCER ENGINE
 * ============================================================================
 */

// ============================================================================
// 1. SHARED CONSTANTS & SYSTEM EVENTS
// ============================================================================
const SystemEvents = {
  FileCreated: 'VFS_FILE_CREATED',
  FileDeleted: 'VFS_FILE_DELETED',
  FileMoved: 'VFS_FILE_MOVED',
  FolderCreated: 'VFS_FOLDER_CREATED',
  FolderMoved: 'VFS_FOLDER_MOVED',
  ActionRegistered: 'SEQ_ACTION_REGISTERED',
  ActionExecuted: 'SEQ_ACTION_EXECUTED',
  ActionUndo: 'SEQ_ACTION_UNDO',
  ActionRedo: 'SEQ_ACTION_REDO',
  StateChanged: 'SYS_STATE_CHANGED'
};

// ============================================================================
// 2. LIGHTWEIGHT EVENT BUS (Pub/Sub)
// ============================================================================
class EventBus {
  constructor() {
    this.listeners = {};
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event, callback) {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
  }

  emit(event, payload) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(callback => {
      try {
        callback(payload);
      } catch (error) {
        console.error(`[EventBus] Error in listener for ${event}:`, error);
      }
    });
  }
}

const sysEventBus = new EventBus();

// ============================================================================
// 3. UTILITIES (ID Generator & Metadata Helpers)
// ============================================================================
class CryptoIdGenerator {
  static generate(prefix) {
    // ブラウザ標準のcrypto.randomUUID()を使用。不可能な場合はフォールバック
    const uuid = typeof crypto !== 'undefined' && crypto.randomUUID 
      ? crypto.randomUUID() 
      : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
    return `${prefix}_${uuid}`;
  }

  static getTypeFromId(id) {
    if (typeof id !== 'string') return null;
    if (id.startsWith('file_')) return 'File';
    if (id.startsWith('dir_')) return 'Folder';
    if (id.startsWith('act_')) return 'Action';
    return null;
  }
}

class BaseEntityFactory {
  static createBase(prefix, version = 1) {
    const now = Date.now();
    return {
      id: CryptoIdGenerator.generate(prefix),
      version: version,
      createdAt: now,
      updatedAt: now
    };
  }
}

// ============================================================================
// 4. FILE VIRTUALIZER (Virtual File System)
// ============================================================================
class FileVirtualizer {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.state = {
      rootFolderId: null,
      folders: {},
      files: {}
    };
  }

  initEmptySystem(rootName = "Root") {
    const rootFolder = {
      ...BaseEntityFactory.createBase('dir'),
      name: rootName,
      parentId: null,
      childrenIds: [],
      type: 'Normal'
    };
    
    this.state.rootFolderId = rootFolder.id;
    this.state.folders[rootFolder.id] = rootFolder;
    
    this.eventBus.emit(SystemEvents.StateChanged, { source: 'FileVirtualizer', operation: 'init' });
    return rootFolder.id;
  }

  createFolder(name, parentId, type = 'Normal') {
    if (!this.state.folders[parentId]) {
      throw new Error(`[VFS] Parent folder ${parentId} not found.`);
    }

    const folder = {
      ...BaseEntityFactory.createBase('dir'),
      name: name,
      parentId: parentId,
      childrenIds: [],
      type: type
    };

    this.state.folders[folder.id] = folder;
    this.state.folders[parentId].childrenIds.push(folder.id);
    this.state.folders[parentId].updatedAt = Date.now();

    this.eventBus.emit(SystemEvents.FolderCreated, folder);
    this.eventBus.emit(SystemEvents.StateChanged, { source: 'FileVirtualizer', operation: 'createFolder', id: folder.id });
    return folder.id;
  }

  createFile(name, extension, size, originalPath, parentId) {
    if (!this.state.folders[parentId]) {
      throw new Error(`[VFS] Target folder ${parentId} not found.`);
    }

    const file = {
      ...BaseEntityFactory.createBase('file'),
      name: name,
      extension: extension,
      size: size,
      originalPath: originalPath,
      parentId: parentId,
      relatedActionIds: []
    };

    this.state.files[file.id] = file;
    this.state.folders[parentId].childrenIds.push(file.id);
    this.state.folders[parentId].updatedAt = Date.now();

    this.eventBus.emit(SystemEvents.FileCreated, file);
    this.eventBus.emit(SystemEvents.StateChanged, { source: 'FileVirtualizer', operation: 'createFile', id: file.id });
    return file.id;
  }

  // 内部的な原子移動操作（Sequencerからの実行のみを想定）
  internalMoveFile(fileId, toFolderId, actionId) {
    const file = this.state.files[fileId];
    if (!file) throw new Error(`[VFS] File ${fileId} not found.`);
    
    const fromFolderId = file.parentId;
    const fromFolder = this.state.folders[fromFolderId];
    const toFolder = this.state.folders[toFolderId];

    if (!toFolder) throw new Error(`[VFS] Target folder ${toFolderId} not found.`);

    // 古い親の子供一覧から削除
    if (fromFolder) {
      fromFolder.childrenIds = fromFolder.childrenIds.filter(id => id !== fileId);
      fromFolder.updatedAt = Date.now();
    }

    // 新しい情報をセット
    file.parentId = toFolderId;
    if (actionId && !file.relatedActionIds.includes(actionId)) {
      file.relatedActionIds.push(actionId);
    }
    file.updatedAt = Date.now();

    toFolder.childrenIds.push(fileId);
    toFolder.updatedAt = Date.now();

    this.eventBus.emit(SystemEvents.FileMoved, { fileId, fromFolderId, toFolderId, actionId });
  }

  // 内部的な原子フォルダ移動操作（Sequencerからの実行のみを想定）
  internalMoveFolder(folderId, toFolderId, actionId) {
    const targetFolder = this.state.folders[folderId];
    if (!targetFolder) throw new Error(`[VFS] Folder ${folderId} not found.`);
    if (folderId === toFolderId) throw new Error(`[VFS] Cannot move folder into itself.`);

    const fromFolderId = targetFolder.parentId;
    const fromFolder = this.state.folders[fromFolderId];
    const toFolder = this.state.folders[toFolderId];

    if (!toFolder) throw new Error(`[VFS] Destination folder ${toFolderId} not found.`);

    if (fromFolder) {
      fromFolder.childrenIds = fromFolder.childrenIds.filter(id => id !== folderId);
      fromFolder.updatedAt = Date.now();
    }

    targetFolder.parentId = toFolderId;
    targetFolder.updatedAt = Date.now();

    toFolder.childrenIds.push(folderId);
    toFolder.updatedAt = Date.now();

    this.eventBus.emit(SystemEvents.FolderMoved, { folderId, fromFolderId, toFolderId, actionId });
  }

  getFile(id) { return this.state.files[id] ? { ...this.state.files[id] } : null; }
  getFolder(id) { return this.state.folders[id] ? { ...this.state.folders[id] } : null; }
  
  // 削除神殿（DeleteTypeフォルダ）の自動検索、または動的取得用
  getDeleteFolderId() {
    return Object.keys(this.state.folders).find(id => this.state.folders[id].type === 'Delete') || null;
  }
}

// ============================================================================
// 5. ACTION SEQUENCER (Command & History Manager)
// ============================================================================
class ActionSequencer {
  constructor(eventBus, fileVirtualizer) {
    this.eventBus = eventBus;
    this.vfs = fileVirtualizer;
    this.history = [];
    this.undoPointer = -1; // -1が初期状態（何も実行していない）
  }

  pushAndExecute(type, targetId, payload = {}) {
    // Redo可能な未確定履歴が先にある状態で新規追加された場合、それ以降を切り捨てる
    if (this.undoPointer < this.history.length - 1) {
      this.history = this.history.slice(0, this.undoPointer + 1);
    }

    const targetType = CryptoIdGenerator.getTypeFromId(targetId);
    if (!targetType) throw new Error(`[Sequencer] Invalid Target ID format: ${targetId}`);

    // 自動補完ロジック：Move/Delete操作時の元の所属（fromFolderId）の自動記録
    let processedPayload = { ...payload };
    if ((type === 'Move' || type === 'Delete') && targetType === 'File') {
      const file = this.vfs.getFile(targetId);
      if (file) processedPayload.fromFolderId = file.parentId;
    } else if (type === 'MoveFolder' && targetType === 'Folder') {
      const folder = this.vfs.getFolder(targetId);
      if (folder) processedPayload.fromFolderId = folder.parentId;
    }

    // 「Delete」アクションを処理しつつ、内部にMove（削除神殿への移動予定）を内包させる
    if (type === 'Delete') {
      const deleteFolderId = this.vfs.getDeleteFolderId();
      if (!deleteFolderId) {
        throw new Error("[Sequencer] Delete Action failed: A folder with type 'Delete' (削除神殿) does not exist in VFS.");
      }
      processedPayload.toFolderId = deleteFolderId;
    }

    const action = {
      ...BaseEntityFactory.createBase('act'),
      type: type,
      targetId: targetId,
      timestamp: Date.now(),
      status: 'Pending',
      payload: processedPayload
    };

    this.history.push(action);
    this.undoPointer++;

    this.eventBus.emit(SystemEvents.ActionRegistered, action);
    this._executeAction(action);
  }

  _executeAction(action) {
    try {
      const targetType = CryptoIdGenerator.getTypeFromId(action.targetId);

      switch (action.type) {
        case 'Move':
        case 'Delete': // Delete属性であっても、内部データ的には削除神殿フォルダへの移動ロジックを実行
          if (targetType === 'File') {
            this.vfs.internalMoveFile(action.targetId, action.payload.toFolderId, action.id);
          }
          break;

        case 'MoveFolder':
          if (targetType === 'Folder') {
            this.vfs.internalMoveFolder(action.targetId, action.payload.toFolderId, action.id);
          }
          break;

        case 'Hold':
          // Holdは状態定義のみ。VFS側への物理的移動は行わないが、ファイル側のrelatedActionIdsへは刻印
          const file = this.vfs.state.files[action.targetId];
          if (file && !file.relatedActionIds.includes(action.id)) {
            file.relatedActionIds.push(action.id);
          }
          break;

        case 'CreateFolder':
          // 動的生成アクションの場合
          if (!this.vfs.state.folders[action.targetId]) {
            const newId = this.vfs.createFolder(action.payload.folderName, action.payload.toFolderId, 'Organize');
            // 生成された本当のIDを今後のためにマッピング（今回は不変性担保のため簡易処理）
          }
          break;
      }

      action.status = 'Executed';
      action.updatedAt = Date.now();
      
      this.eventBus.emit(SystemEvents.ActionExecuted, action);
      this.eventBus.emit(SystemEvents.StateChanged, { source: 'ActionSequencer', operation: 'execute', actionId: action.id });
    } catch (error) {
      this.history.pop();
      this.undoPointer--;
      console.error(`[Sequencer] Action execution critical error. Rolled back from registry.`, error);
    }
  }

  undo() {
    if (this.undoPointer < 0) {
      console.warn("[Sequencer] No actions left to undo.");
      return false;
    }

    const action = this.history[this.undoPointer];
    const targetType = CryptoIdGenerator.getTypeFromId(action.targetId);

    try {
      switch (action.type) {
        case 'Move':
        case 'Delete':
          if (targetType === 'File') {
            // 元のフォルダ（fromFolderId）へ強制巻き戻し
            this.vfs.internalMoveFile(action.targetId, action.payload.fromFolderId, action.id);
          }
          break;

        case 'MoveFolder':
          if (targetType === 'Folder') {
            this.vfs.internalMoveFolder(action.targetId, action.payload.fromFolderId, action.id);
          }
          break;

        case 'Hold':
          // Hold解除時はファイルから今回のAction IDをポップする
          const file = this.vfs.state.files[action.targetId];
          if (file) {
            file.relatedActionIds = file.relatedActionIds.filter(id => id !== action.id);
          }
          break;

        case 'CreateFolder':
          // 後続フェーズで本格実装されるフォルダ実体の逆生成・不活性化ロジックの口
          break;
      }

      action.status = 'Reverted';
      action.updatedAt = Date.now();
      this.undoPointer--;

      this.eventBus.emit(SystemEvents.ActionUndo, action);
      this.eventBus.emit(SystemEvents.StateChanged, { source: 'ActionSequencer', operation: 'undo', actionId: action.id });
      return true;
    } catch (error) {
      console.error(`[Sequencer] Critical error during undo processing.`, error);
      return false;
    }
  }

  redo() {
    if (this.undoPointer >= this.history.length - 1) {
      console.warn("[Sequencer] No actions left to redo.");
      return false;
    }

    this.undoPointer++;
    const action = this.history[this.undoPointer];
    
    // 再実行
    this._executeAction(action);
    this.eventBus.emit(SystemEvents.ActionRedo, action);
    return true;
  }

  getHistoryLog() {
    return this.history.map(act => ({ ...act }));
  }
}

// ============================================================================
// 6. PERSISTENCE HANDLER (Save/Load & Serializer)
// ============================================================================
class PersistenceHandler {
  static SCHEMA_VERSION = 1;

  static serialize(fileVirtualizer, actionSequencer) {
    const backupPackage = {
      meta: {
        schemaVersion: this.SCHEMA_VERSION,
        exportedAt: Date.now()
      },
      vfsState: fileVirtualizer.state,
      sequencerState: {
        history: actionSequencer.history,
        undoPointer: actionSequencer.undoPointer
      }
    };
    return JSON.stringify(backupPackage);
  }

  static deserialize(jsonString, fileVirtualizer, actionSequencer) {
    try {
      const backupPackage = JSON.parse(jsonString);
      
      if (!backupPackage.meta || backupPackage.meta.schemaVersion !== this.SCHEMA_VERSION) {
        throw new Error(`[Persistence] Structural Version Mismatch or Invalid JSON Scheme.`);
      }

      // VFSデータの復元
      fileVirtualizer.state = backupPackage.vfsState;
      
      // Sequencerデータの復元
      actionSequencer.history = backupPackage.sequencerState.history;
      actionSequencer.undoPointer = backupPackage.sequencerState.undoPointer;

      fileVirtualizer.eventBus.emit(SystemEvents.StateChanged, { source: 'PersistenceHandler', operation: 'deserialize' });
      return true;
    } catch (error) {
      console.error(`[Persistence] Deserialization failed. Core systems were protected.`, error);
      return false;
    }
  }
}