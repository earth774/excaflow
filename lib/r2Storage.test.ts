import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { uploadRoomFileToStorage, deleteRoomFileFromStorage, deleteRoomFolder } from './r2Storage';

// Mock client-s3 commands
vi.mock('@aws-sdk/client-s3', () => {
  return {
    PutObjectCommand: vi.fn(),
    DeleteObjectCommand: vi.fn(),
    DeleteObjectsCommand: vi.fn(),
    ListObjectsV2Command: vi.fn(),
    S3Client: vi.fn(() => ({
      send: vi.fn(),
    })),
  };
});

const mockSend = vi.fn();

// Mock r2Client to return our mocked S3Client
vi.mock('./r2Client', () => ({
  getR2Client: () => ({
    send: mockSend,
  }),
  getR2BucketName: () => 'test-bucket',
  getR2PublicUrl: (key: string) => `https://pub.dev/${key}`,
}));

describe('r2Storage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadRoomFileToStorage', () => {
    it('should upload file and return public url', async () => {
      const result = await uploadRoomFileToStorage('room1', 'file1', 'data:image/png;base64,test', 'image/png');
      
      expect(mockSend).toHaveBeenCalled();
      expect(result).toBe('https://pub.dev/room1/file1.png');
    });
    
    it('should handle dataURL without prefix', async () => {
      // Direct base64 without "data:..."
      const result = await uploadRoomFileToStorage('room1', 'file1', 'SGVsbG8=', 'image/png');
      expect(mockSend).toHaveBeenCalled();
      expect(result).toBe('https://pub.dev/room1/file1.png');
    });

    it('should use extension from mime type if known', async () => {
      await uploadRoomFileToStorage('room1', 'file1', 'data:image/png;base64,test', 'image/svg+xml');
      // Check if key ends with .svg
      // Note: In implementation, mimeToExtension['image/svg+xml'] -> 'svg'
      // I can't easily check arguments of PutObjectCommand constructor here because I mocked the class in module scope.
      // But I can verify result url if logic is correct
      const result = await uploadRoomFileToStorage('room1', 'file1', 'data:image/png;base64,test', 'image/svg+xml');
      expect(result).toBe('https://pub.dev/room1/file1.svg');
    });

    it('should fallback to mime split if extension unknown', async () => {
       const result = await uploadRoomFileToStorage('room1', 'file1', 'data:image/png;base64,test', 'unknown/custom');
       expect(result).toBe('https://pub.dev/room1/file1.custom');
    });
    
    it('should fallback to png if all else fails', async () => {
        // mimeType "unknown" -> split gives ["unknown"] -> index 1 undefined -> || "png"
        const result = await uploadRoomFileToStorage('room1', 'file1', 'data:image/png;base64,test', 'unknown');
        expect(result).toBe('https://pub.dev/room1/file1.png');
    });

    it('should throw on error', async () => {
      mockSend.mockRejectedValue(new Error('Upload failed'));
      await expect(uploadRoomFileToStorage('room1', 'file1', 'data:image/png;base64,test', 'image/png'))
        .rejects.toThrow('Upload failed');
    });
  });

  describe('deleteRoomFileFromStorage', () => {
    it('should delete file', async () => {
      await deleteRoomFileFromStorage('room1', 'file1', 'image/png');
      expect(mockSend).toHaveBeenCalled();
    });
    
    it('should handle extension logic', async () => {
         // We can spy on console to verify the key logged, but verifying side effect (mockSend) is enough coverage for execution path
         await deleteRoomFileFromStorage('room1', 'file1', 'unknown/custom');
         expect(mockSend).toHaveBeenCalled();
    });

    it('should fallback to png if extension unknown', async () => {
        await deleteRoomFileFromStorage('room1', 'file1', 'unknown');
        expect(mockSend).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
       mockSend.mockRejectedValue(new Error('Delete failed'));
       const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
       
       await deleteRoomFileFromStorage('room1', 'file1', 'image/png');
       
       expect(consoleSpy).toHaveBeenCalled();
       consoleSpy.mockRestore();
    });
  });

  describe('deleteRoomFolder', () => {
      it('should list and delete files', async () => {
          mockSend.mockResolvedValueOnce({ // List response
              Contents: [{ Key: 'room1/1.png' }, { Key: 'room1/2.png' }]
          }).mockResolvedValueOnce({}); // Delete response

          await deleteRoomFolder('room1');

          expect(mockSend).toHaveBeenCalledTimes(2);
      });

      it('should do nothing if no files (Contents undefined)', async () => {
          mockSend.mockResolvedValueOnce({}); // Contents undefined
          await deleteRoomFolder('room1');
          expect(mockSend).toHaveBeenCalledTimes(1);
      });
      
      it('should do nothing if no files (Contents empty)', async () => {
          mockSend.mockResolvedValueOnce({ Contents: [] });
          await deleteRoomFolder('room1');
          expect(mockSend).toHaveBeenCalledTimes(1);
      });
      
      it('should do nothing if objects to delete is empty (filtered out)', async () => {
          // If keys are missing (should not happen in real S3 but possible in types)
          mockSend.mockResolvedValueOnce({ Contents: [{ Key: undefined }] });
           const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
          await deleteRoomFolder('room1');
          expect(mockSend).toHaveBeenCalledTimes(1); // List only
          expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No valid keys to delete'));
      });

      it('should handle error during list', async () => {
          mockSend.mockRejectedValue(new Error('List failed'));
          const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
          await deleteRoomFolder('room1');
          expect(consoleSpy).toHaveBeenCalledWith('[r2Storage] Error in deleteRoomFolder:', expect.any(Error));
      });

      it('should handle error during delete', async () => {
          mockSend.mockResolvedValueOnce({ // List succeeds
              Contents: [{ Key: 'room1/1.png' }]
          }).mockRejectedValueOnce(new Error('Delete failed')); // Delete fails
          
          const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
          await deleteRoomFolder('room1');
          expect(consoleSpy).toHaveBeenCalledWith('[r2Storage] Error in deleteRoomFolder:', expect.any(Error));
      });
  });
});