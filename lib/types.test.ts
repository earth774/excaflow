import { describe, it, expect } from 'vitest';
import { 
  type RoomIndexEntry, 
  type LocalRoom, 
  type Room, 
  type ExcalidrawScene,
  type DrawingData,
  ROOM_STATUSES,
  SAVE_STATUSES,
  DEFAULT_SCENE,
  isRoomStatus
} from './types';

describe('Type Definitions', () => {
  it('should support valid RoomIndexEntry structure', () => {
    const entry: RoomIndexEntry = {
      id: 'room-123',
      title: 'My Drawing',
      status: 'local-only',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
      lastSyncedAt: null,
      tags: ['design', 'mockup']
    };

    expect(entry.id).toBe('room-123');
    expect(entry.tags).toHaveLength(2);
    expect(entry.status).toBe('local-only');
  });

  it('should support valid LocalRoom structure with Scene', () => {
    const mockScene: ExcalidrawScene = {
      elements: [{ type: 'rectangle', id: 'rect-1' }],
      appState: { zoom: { value: 1 } },
      files: {}
    };

    const localRoom: LocalRoom = {
      id: 'local-1',
      title: 'Local Project',
      description: 'A test project',
      scene: mockScene,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastSyncedAt: null,
      status: 'synced',
      tags: []
    };

    expect(localRoom.scene.elements).toBeDefined();
    expect(localRoom.scene.elements[0].type).toBe('rectangle');
    expect(localRoom.status).toBe('synced');
  });

  it('should support Room structure (Database Model)', () => {
    const dbRoom: Room = {
      id: 'db-123',
      title: 'Database Room',
      description: null,
      scene: {
        elements: [],
        appState: {}
      },
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
      lastSyncedAt: new Date('2024-01-02'),
      tags: ['production']
    };

    expect(dbRoom.createdAt).toBeInstanceOf(Date);
    expect(dbRoom.lastSyncedAt).toBeInstanceOf(Date);
  });

  it('should support DrawingData structure', () => {
    const data: DrawingData = {
      elements: [],
      appState: { viewBackgroundColor: '#ffffff' },
      timestamp: 1234567890
    };

    expect(data.timestamp).toBeTypeOf('number');
    expect(data.appState).toHaveProperty('viewBackgroundColor');
  });

  it('should validate runtime constants and helpers', () => {
    expect(ROOM_STATUSES).toContain('local-only');
    expect(ROOM_STATUSES).toContain('synced');
    expect(SAVE_STATUSES).toContain('saved');
    
    expect(DEFAULT_SCENE.elements).toEqual([]);
    expect(DEFAULT_SCENE.appState).toEqual({});
    
    expect(isRoomStatus('local-only')).toBe(true);
    expect(isRoomStatus('synced')).toBe(true);
    expect(isRoomStatus('invalid')).toBe(false);
  });
});
