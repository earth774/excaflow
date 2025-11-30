import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  generateRoomId, 
  loadRoomsIndex, 
  saveRoomsIndex,
  addRoomToIndex,
  removeRoomFromIndex,
  updateRoomInIndex,
  loadLocalRoom,
  saveLocalRoom,
  deleteLocalRoom,
  createLocalRoom,
  updateLocalRoomScene,
  updateLocalRoomMetadata,
  markRoomAsSynced,
  loadRooms,
  saveRooms,
  addRoom,
  deleteRoom,
  loadDrawingData,
  saveDrawingData,
  getLastSavedTime
} from './storage';
import * as idb from 'idb-keyval';

vi.mock('idb-keyval');

describe('storage', () => {
  const mockGet = idb.get as any;
  const mockSet = idb.set as any;
  const mockDel = idb.del as any;

  // Mock localStorage
  const localStorageMock = (() => {
    let store: Record<string, string> = {};
    return {
      getItem: vi.fn((key: string) => store[key] || null),
      setItem: vi.fn((key: string, value: string) => {
        store[key] = value.toString();
      }),
      removeItem: vi.fn((key: string) => {
        delete store[key];
      }),
      clear: vi.fn(() => {
        store = {};
      }),
    };
  })();

  const originalWindow = global.window;
  const originalCrypto = global.crypto;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(global, 'window', {
      value: originalWindow,
      writable: true
    });
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true
    });
    localStorageMock.clear();
    
    // Reset crypto
    Object.defineProperty(global, 'crypto', {
      value: originalCrypto,
      writable: true
    });
  });

  describe('generateRoomId', () => {
    it('should use crypto.randomUUID if available', () => {
      const mockUUID = '12345678-1234-1234-1234-1234567890ab';
      Object.defineProperty(global, 'crypto', {
        value: { randomUUID: () => mockUUID },
        writable: true
      });
      
      expect(generateRoomId()).toBe(mockUUID);
    });

    it('should fallback to timestamp if crypto is not available', () => {
      Object.defineProperty(global, 'crypto', {
        value: undefined,
        writable: true
      });
      
      const id = generateRoomId();
      expect(id).toMatch(/^room-/);
    });

    it('should fallback if window is undefined (SSR)', () => {
      Object.defineProperty(global, 'window', {
        value: undefined,
        writable: true
      });
      const id = generateRoomId();
      expect(id).toMatch(/^room-/);
    });
  });

  describe('Room Index Management', () => {
    it('should handle corrupted JSON in index', () => {
      localStorageMock.getItem.mockReturnValueOnce('invalid-json');
      const index = loadRoomsIndex();
      expect(index).toEqual([]);
    });

    it('should remove room from index', () => {
      const entry1 = { id: '1', title: 'one' } as any;
      const entry2 = { id: '2', title: 'two' } as any;
      localStorageMock.setItem('excalidraw:rooms:index', JSON.stringify([entry1, entry2]));
      
      removeRoomFromIndex('1');
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'excalidraw:rooms:index',
        JSON.stringify([entry2])
      );
    });

    it('should update room in index', () => {
      const entry = { id: '1', title: 'old' } as any;
      localStorageMock.setItem('excalidraw:rooms:index', JSON.stringify([entry]));
      
      updateRoomInIndex('1', { title: 'new' });
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'excalidraw:rooms:index',
        JSON.stringify([{ id: '1', title: 'new' }])
      );
    });
    
    it('should not save index if window is undefined', () => {
      Object.defineProperty(global, 'window', { value: undefined });
      saveRoomsIndex([]);
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });
  });

  describe('Local Room Management', () => {
    it('should return null if window is undefined', async () => {
      Object.defineProperty(global, 'window', { value: undefined });
      const room = await loadLocalRoom('1');
      expect(room).toBeNull();
    });

    it('should migrate from localStorage to IDB if not in IDB', async () => {
      mockGet.mockResolvedValue(undefined); // Not in IDB
      const legacyRoom = { id: '1', title: 'migrated' };
      localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(legacyRoom));
      
      const room = await loadLocalRoom('1');
      
      expect(room).toEqual(legacyRoom);
      expect(mockSet).toHaveBeenCalledWith('excalidraw:room:1', legacyRoom);
    });

    it('should handle migration errors', async () => {
       mockGet.mockResolvedValue(undefined);
       localStorageMock.getItem.mockReturnValueOnce('invalid-json');
       const room = await loadLocalRoom('1');
       expect(room).toBeNull();
    });
    
    it('should handle IDB errors gracefully in loadLocalRoom', async () => {
        mockGet.mockRejectedValue(new Error('IDB error'));
        const room = await loadLocalRoom('1');
        expect(room).toBeNull();
    });

    it('should optimize files when saving (remove base64)', async () => {
       const room = {
           id: '1',
           scene: {
               files: {
                   'file1': { supabaseUrl: 'url', dataURL: 'data:image/png;base64,xyz' },
                   'file2': { dataURL: 'data:image/png;base64,abc' } // Keep this
               }
           }
       } as any;
       
       await saveLocalRoom(room);
       
       const savedRoom = mockSet.mock.calls[0][1];
       expect(savedRoom.scene.files['file1'].dataURL).toBeUndefined();
       expect(savedRoom.scene.files['file2'].dataURL).toBeDefined();
    });
    
    it('should warn if saving when window undefined', async () => {
        Object.defineProperty(global, 'window', { value: undefined });
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await saveLocalRoom({ id: '1' } as any);
        expect(consoleSpy).toHaveBeenCalledWith('saveLocalRoom: window is undefined');
        consoleSpy.mockRestore();
    });

    it('should handle errors when saving local room', async () => {
        mockSet.mockRejectedValue(new Error('Save failed'));
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await saveLocalRoom({ id: '1' } as any);
        expect(consoleSpy).toHaveBeenCalledWith('Error saving local room:', expect.any(Error));
        consoleSpy.mockRestore();
    });
    
    it('should delete from localStorage as well when deleting local room', async () => {
        await deleteLocalRoom('1');
        expect(localStorageMock.removeItem).toHaveBeenCalledWith('excalidraw:room:1');
    });
    
    it('should return if window undefined when deleting', async () => {
        Object.defineProperty(global, 'window', { value: undefined });
        await deleteLocalRoom('1');
        expect(mockDel).not.toHaveBeenCalled();
    });

     it('should handle errors when deleting local room', async () => {
        mockDel.mockRejectedValue(new Error('Delete failed'));
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await deleteLocalRoom('1');
        expect(consoleSpy).toHaveBeenCalledWith('Error deleting local room:', expect.any(Error));
        consoleSpy.mockRestore();
    });
  });

  describe('Room Updates', () => {
      it('should update room scene and mark as local-only if synced', async () => {
          mockGet.mockResolvedValue({ 
              id: '1', 
              status: 'synced',
              scene: { elements: [] }
          });
          
          await updateLocalRoomScene('1', { elements: [1] } as any);
          
          const saved = mockSet.mock.calls[0][1];
          expect(saved.status).toBe('local-only');
          expect(saved.scene.elements).toEqual([1]);
      });

      it('should warn if room not found for scene update', async () => {
          mockGet.mockResolvedValue(undefined);
          const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
          await updateLocalRoomScene('1', {} as any);
          expect(consoleSpy).toHaveBeenCalledWith('updateLocalRoomScene: Room not found:', '1');
      });
      
       it('should return if window undefined for scene update', async () => {
          Object.defineProperty(global, 'window', { value: undefined });
          await updateLocalRoomScene('1', {} as any);
          expect(mockGet).not.toHaveBeenCalled();
      });

      it('should update metadata', async () => {
          mockGet.mockResolvedValue({ id: '1', title: 'old' });
          await updateLocalRoomMetadata('1', { title: 'new' });
          const saved = mockSet.mock.calls[0][1];
          expect(saved.title).toBe('new');
      });
      
      it('should do nothing if room not found for metadata update', async () => {
           mockGet.mockResolvedValue(undefined);
           await updateLocalRoomMetadata('1', { title: 'new' });
           expect(mockSet).not.toHaveBeenCalled();
      });

      it('should mark room as synced', async () => {
          mockGet.mockResolvedValue({ id: '1', status: 'local-only' });
          await markRoomAsSynced('1', '2024-01-01');
          const saved = mockSet.mock.calls[0][1];
          expect(saved.status).toBe('synced');
          expect(saved.lastSyncedAt).toBe('2024-01-01');
      });
      
       it('should do nothing if room not found for sync mark', async () => {
           mockGet.mockResolvedValue(undefined);
           await markRoomAsSynced('1', 'date');
           expect(mockSet).not.toHaveBeenCalled();
      });
  });

  describe('Legacy API', () => {
      it('should load legacy rooms', () => {
          localStorageMock.getItem.mockReturnValueOnce(JSON.stringify([{ id: '1' }]));
          expect(loadRooms()).toEqual([{ id: '1' }]);
      });

      it('should return empty array on error loading legacy rooms', () => {
          localStorageMock.getItem.mockReturnValueOnce('invalid');
          expect(loadRooms()).toEqual([]);
      });
      
      it('should return empty array if window undefined', () => {
          Object.defineProperty(global, 'window', { value: undefined });
          expect(loadRooms()).toEqual([]);
      });

      it('should add legacy room', () => {
          localStorageMock.getItem.mockReturnValueOnce('[]');
          addRoom({ id: '1' } as any);
          expect(localStorageMock.setItem).toHaveBeenCalledWith('excalidraw-rooms', JSON.stringify([{ id: '1' }]));
      });
      
      it('should handle error saving rooms', () => {
           localStorageMock.setItem.mockImplementationOnce(() => { throw new Error('fail') });
           const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
           saveRooms([]);
           expect(consoleSpy).toHaveBeenCalledWith('Error saving rooms:', expect.any(Error));
      });

      it('should delete legacy room', () => {
          localStorageMock.getItem.mockReturnValueOnce(JSON.stringify([{ id: '1' }, { id: '2' }]));
          deleteRoom('1');
          expect(localStorageMock.setItem).toHaveBeenCalledWith('excalidraw-rooms', JSON.stringify([{ id: '2' }]));
          expect(localStorageMock.removeItem).toHaveBeenCalledWith('excalidraw-room-1');
      });
      
      it('should handle errors deleting legacy room data', () => {
           localStorageMock.getItem.mockReturnValueOnce('[]');
           localStorageMock.removeItem.mockImplementationOnce(() => { throw new Error('fail') });
           const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
           deleteRoom('1');
           expect(consoleSpy).toHaveBeenCalledWith('Error deleting room data:', expect.any(Error));
      });
  });

    describe('Drawing Data (Hybrid)', () => {

        it('should load from new local room if available', async () => {

            mockGet.mockResolvedValue({ 

                id: '1', 

                updatedAt: '2024-01-01T00:00:00.000Z',

                scene: { elements: [1], appState: { zoom: 1 } }

            });

            

            const data = await loadDrawingData('1');

            expect(data?.elements).toEqual([1]);

            expect(data?.timestamp).toBe(new Date('2024-01-01T00:00:00.000Z').getTime());

        });

  

        it('should fallback to legacy data if new room not found', async () => {

            mockGet.mockResolvedValue(undefined); // Not in IDB

            const legacyData = { elements: [2], appState: {}, timestamp: 123 };

            

            // loadLocalRoom checks 'excalidraw:room:1', loadDrawingData fallback checks 'excalidraw-room-1'

            localStorageMock.getItem.mockImplementation((key: string) => {

                if (key === 'excalidraw-room-1') return JSON.stringify(legacyData);

                return null;

            });

            

            const data = await loadDrawingData('1');

            expect(data).toEqual(legacyData);

        });

  

        it('should return null if no data anywhere', async () => {

             mockGet.mockResolvedValue(undefined);

             localStorageMock.getItem.mockReturnValue(null);

             const data = await loadDrawingData('1');

             expect(data).toBeNull();

        });

        

        it('should handle errors in loading drawing data', async () => {

             mockGet.mockResolvedValue(undefined);

             // Make the legacy load fail

             localStorageMock.getItem.mockImplementation((key: string) => {

                 if (key === 'excalidraw-room-1') return 'invalid';

                 return null;

             });

             const data = await loadDrawingData('1');

             expect(data).toBeNull();

        });

  

        it('should save to new room if exists', async () => {

             mockGet.mockResolvedValue({ 

                 id: '1', 

                 scene: { files: { 'f1': {} } }

             });

             

             await saveDrawingData('1', { elements: [1], appState: {} } as any);

             

             const saved = mockSet.mock.calls[0][1];

             expect(saved.scene.elements).toEqual([1]);

             // Should preserve files

             expect(saved.scene.files).toEqual({ 'f1': {} });

        });

  

        it('should save to legacy format if new room does not exist', async () => {

             mockGet.mockResolvedValue(undefined);

             localStorageMock.getItem.mockReturnValue(null); // loadLocalRoom finds nothing

  

             await saveDrawingData('1', { elements: [1], appState: {}, timestamp: 123 } as any);

             

             expect(localStorageMock.setItem).toHaveBeenCalledWith(

                 'excalidraw-room-1', 

                 expect.stringContaining('"elements":[1]')

             );

        });

        

        it('should handle errors saving drawing data', async () => {

            mockGet.mockRejectedValue(new Error('fail'));

            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

             await saveDrawingData('1', {} as any);

             expect(consoleSpy).toHaveBeenCalledWith('Error saving drawing data:', expect.any(Error));

        });

  

        it('should get last saved time from new room', async () => {

            mockGet.mockResolvedValue({ updatedAt: '2024-01-01' });

            const time = await getLastSavedTime('1');

            expect(time).toBeTruthy(); // Localized string

        });

  

         it('should get last saved time from legacy', async () => {

            mockGet.mockResolvedValue(undefined);

            localStorageMock.getItem.mockImplementation((key: string) => {

                if (key.includes('-last-saved')) return 'time-string';

                return null;

            });

            const time = await getLastSavedTime('1');

            expect(time).toBe('time-string');

        });

        

        it('should handle errors getting last saved time', async () => {

             mockGet.mockResolvedValue(undefined);

             localStorageMock.getItem.mockImplementation((key: string) => {

                 if (key.includes('-last-saved')) throw new Error('fail');

                 return null;

             });

             const time = await getLastSavedTime('1');

             expect(time).toBeNull();

        });

    });

  
});
