import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uploadRoomFileToStorage, deleteRoomFileFromStorage, deleteRoomFolder } from './supabaseStorage';
import { createClient } from '@supabase/supabase-js';

// Mock @supabase/supabase-js
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

describe('supabaseStorage', () => {
  const mockUpload = vi.fn();
  const mockGetPublicUrl = vi.fn();
  const mockListBuckets = vi.fn();
  const mockCreateBucket = vi.fn();
  const mockRemove = vi.fn();
  const mockList = vi.fn();
  const mockFrom = vi.fn();

  const mockSupabase = {
    storage: {
      listBuckets: mockListBuckets,
      createBucket: mockCreateBucket,
      from: mockFrom,
    },
  };

  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
    
    // Setup default mock implementations
    (createClient as any).mockReturnValue(mockSupabase);
    
    mockFrom.mockReturnValue({
      upload: mockUpload,
      getPublicUrl: mockGetPublicUrl,
      remove: mockRemove,
      list: mockList,
    });

    mockListBuckets.mockResolvedValue({ data: [{ name: 'excalidraw-files' }], error: null });
    mockCreateBucket.mockResolvedValue({ error: null });
    mockUpload.mockResolvedValue({ data: { path: 'path/to/file' }, error: null });
    mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'https://example.com/file.png' } });
    mockRemove.mockResolvedValue({ error: null });
    mockList.mockResolvedValue({ data: [], error: null });

    // Setup Environment variables
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = originalEnv;
  });

  describe('Configuration', () => {
    it('should throw if NEXT_PUBLIC_SUPABASE_URL is missing', async () => {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      await expect(uploadRoomFileToStorage('room1', 'file1', 'data:image/png;base64,test', 'image/png'))
        .rejects.toThrow(/Missing Supabase environment variables/);
    });

    it('should throw if SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      await expect(uploadRoomFileToStorage('room1', 'file1', 'data:image/png;base64,test', 'image/png'))
        .rejects.toThrow(/Missing Supabase environment variables/);
    });
  });

  describe('uploadRoomFileToStorage', () => {
    it('should successfully upload a file and return public URL', async () => {
      const result = await uploadRoomFileToStorage('room1', 'file1', 'data:image/png;base64,SGVsbG8=', 'image/png');
      
      expect(mockListBuckets).toHaveBeenCalled(); // ensureBucketExists
      expect(mockUpload).toHaveBeenCalledWith(
        'room1/file1.png',
        expect.any(Buffer),
        expect.objectContaining({ contentType: 'image/png', upsert: true })
      );
      expect(result).toBe('https://example.com/file.png');
    });

    it('should create bucket if it does not exist', async () => {
        mockListBuckets.mockResolvedValue({ data: [], error: null }); // Empty buckets
        
        await uploadRoomFileToStorage('room1', 'file1', 'data:image/png;base64,SGVsbG8=', 'image/png');
        
        expect(mockCreateBucket).toHaveBeenCalledWith('excalidraw-files', expect.any(Object));
    });
    
    it('should throw if bucket check fails', async () => {
        mockListBuckets.mockResolvedValue({ data: null, error: { message: 'List failed' } });
        
        await expect(uploadRoomFileToStorage('room1', 'file1', 'data:image/png;base64,SGVsbG8=', 'image/png'))
            .rejects.toThrow('Failed to check buckets: List failed');
    });

    it('should throw if bucket creation fails', async () => {
        mockListBuckets.mockResolvedValue({ data: [], error: null });
        mockCreateBucket.mockResolvedValue({ error: { message: 'Create failed' } });
        
        await expect(uploadRoomFileToStorage('room1', 'file1', 'data:image/png;base64,SGVsbG8=', 'image/png'))
            .rejects.toThrow('Failed to create bucket: Create failed');
    });

    it('should throw if upload fails', async () => {
        mockUpload.mockResolvedValue({ data: null, error: { message: 'Upload failed' } });
        
        await expect(uploadRoomFileToStorage('room1', 'file1', 'data:image/png;base64,SGVsbG8=', 'image/png'))
            .rejects.toThrow('Failed to upload file: Upload failed');
    });

    it('should handle different mime types correctly', async () => {
        // svg
        await uploadRoomFileToStorage('room1', 'file2', 'data:image/svg+xml;base64,test', 'image/svg+xml');
        expect(mockUpload).toHaveBeenCalledWith('room1/file2.svg', expect.any(Buffer), expect.any(Object));
        
        // jpeg
        await uploadRoomFileToStorage('room1', 'file3', 'data:image/jpeg;base64,test', 'image/jpeg');
        expect(mockUpload).toHaveBeenCalledWith('room1/file3.jpg', expect.any(Buffer), expect.any(Object));
    });
  });

  describe('deleteRoomFileFromStorage', () => {
      it('should delete a file successfully', async () => {
          await deleteRoomFileFromStorage('room1', 'file1', 'image/png');
          
          expect(mockRemove).toHaveBeenCalledWith(['room1/file1.png']);
      });
      
      it('should handle deletion errors gracefully (log only)', async () => {
           const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
           mockRemove.mockResolvedValue({ error: { message: 'Delete failed' } });
           
           await deleteRoomFileFromStorage('room1', 'file1', 'image/png');
           
           expect(consoleSpy).toHaveBeenCalledWith('Error deleting file from Supabase Storage:', expect.anything());
           consoleSpy.mockRestore();
      });
  });

  describe('deleteRoomFolder', () => {
      it('should delete all files in a folder', async () => {
          mockList.mockResolvedValue({ 
              data: [{ name: 'file1.png' }, { name: 'file2.png' }], 
              error: null 
          });
          
          await deleteRoomFolder('room1');
          
          expect(mockList).toHaveBeenCalledWith('room1');
          expect(mockRemove).toHaveBeenCalledWith(['room1/file1.png', 'room1/file2.png']);
      });

      it('should do nothing if no files found', async () => {
          mockList.mockResolvedValue({ data: [], error: null });
          
          await deleteRoomFolder('room1');
          
          expect(mockList).toHaveBeenCalledWith('room1');
          expect(mockRemove).not.toHaveBeenCalled();
      });

      it('should handle list errors gracefully', async () => {
          const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
          mockList.mockResolvedValue({ data: null, error: { message: 'List failed' } });
          
          await deleteRoomFolder('room1');
          
          expect(consoleSpy).toHaveBeenCalledWith('[supabaseStorage] Error listing files for deletion:', expect.anything());
          expect(mockRemove).not.toHaveBeenCalled();
          consoleSpy.mockRestore();
      });

       it('should handle deletion errors gracefully', async () => {
          const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
          mockList.mockResolvedValue({ 
              data: [{ name: 'file1.png' }], 
              error: null 
          });
          mockRemove.mockResolvedValue({ error: { message: 'Remove failed' } });
          
          await deleteRoomFolder('room1');
          
          expect(consoleSpy).toHaveBeenCalledWith('[supabaseStorage] Error deleting files:', expect.anything());
          consoleSpy.mockRestore();
      });
  });
});
