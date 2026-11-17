export interface ProductImageServerConfig {
  enabled: boolean;
  public_base_url: string | null;
  max_bytes: number;
  allowed_types: string[];
}

export interface ProductImagePresign {
  key: string;
  upload_url: string;
  headers: Record<string, string>;
  expires_at: string;
}

export interface ProductImageResult {
  id: string;
  image_key: string | null;
  image_url: string | null;
}
