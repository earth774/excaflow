import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getR2Client, getR2BucketName, getR2PublicUrl } from './r2Client';
import { S3Client } from '@aws-sdk/client-s3';

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(),
}));

describe('r2Client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getR2Client', () => {
    it('should throw if env vars are missing', () => {
      delete process.env.R2_ENDPOINT;
      expect(() => getR2Client()).toThrow('Missing R2 environment variables');
    });

    it('should return S3Client if env vars are present', () => {
      process.env.R2_ENDPOINT = 'https://endpoint';
      process.env.R2_ACCESS_KEY_ID = 'key';
      process.env.R2_SECRET_ACCESS_KEY = 'secret';
      
      const client = getR2Client();
      expect(client).toBeInstanceOf(S3Client);
      expect(S3Client).toHaveBeenCalledWith(expect.objectContaining({
        endpoint: 'https://endpoint',
      }));
    });
  });

  describe('getR2BucketName', () => {
     it('should return bucket name', () => {
        process.env.R2_BUCKET_NAME = 'my-bucket';
        expect(getR2BucketName()).toBe('my-bucket');
     });

     it('should throw if bucket name missing', () => {
         delete process.env.R2_BUCKET_NAME;
         expect(() => getR2BucketName()).toThrow('Missing R2_BUCKET_NAME');
     });
  });

  describe('getR2PublicUrl', () => {
      it('should generate correct URL', () => {
          process.env.R2_PUBLIC_BASE_URL = 'https://pub.dev';
          expect(getR2PublicUrl('test/file.png')).toBe('https://pub.dev/test/file.png');
      });

      it('should handle trailing slash in base url', () => {
          process.env.R2_PUBLIC_BASE_URL = 'https://pub.dev/';
          expect(getR2PublicUrl('test/file.png')).toBe('https://pub.dev/test/file.png');
      });

      it('should throw if base url missing', () => {
          delete process.env.R2_PUBLIC_BASE_URL;
          expect(() => getR2PublicUrl('key')).toThrow('Missing R2_PUBLIC_BASE_URL');
      });
  });
});
