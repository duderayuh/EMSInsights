import jwt from 'jsonwebtoken';

class AppleMapKitTokenService {
  private privateKey: string | undefined;
  private keyId: string | undefined;
  private teamId: string | undefined;
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor() {
    this.privateKey = process.env.APPLE_MAPKIT_JS_KEY;
    this.keyId = process.env.APPLE_KEY_ID;
    this.teamId = process.env.APPLE_TEAM_ID;
  }

  generateToken(): string {
    // Check if we have a cached token that's still valid
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return this.tokenCache.token;
    }

    if (!this.privateKey || !this.keyId || !this.teamId) {
      console.error('Apple MapKit configuration check:', {
        hasPrivateKey: !!this.privateKey,
        hasKeyId: !!this.keyId,
        hasTeamId: !!this.teamId,
        privateKeyStart: this.privateKey ? this.privateKey.substring(0, 50) : 'missing'
      });
      throw new Error('Apple MapKit configuration missing. Required: APPLE_MAPKIT_JS_KEY, APPLE_KEY_ID, APPLE_TEAM_ID');
    }

    try {
      const now = Math.floor(Date.now() / 1000);
      const expiresIn = 365 * 24 * 60 * 60; // 1 year
      
      const payload = {
        iss: this.teamId,
        iat: now,
        exp: now + expiresIn,
        origin: '*' // Allow all origins in development
      };

      console.log('Attempting to generate Apple MapKit token with:', {
        teamId: this.teamId,
        keyId: this.keyId,
        algorithm: 'ES256'
      });

      const token = jwt.sign(payload, this.privateKey, {
        algorithm: 'ES256',
        header: {
          kid: this.keyId,
          typ: 'JWT',
          alg: 'ES256'
        }
      });

      // Cache the token for reuse
      this.tokenCache = {
        token,
        expiresAt: (now + expiresIn - 3600) * 1000 // Expire cache 1 hour before actual expiry
      };

      console.log('Apple MapKit token generated successfully');
      return token;
    } catch (error) {
      console.error('Failed to generate Apple MapKit token:', error);
      throw error;
    }
  }

  isConfigured(): boolean {
    return !!(this.privateKey && this.keyId && this.teamId);
  }
}

export const appleMapKitTokenService = new AppleMapKitTokenService();