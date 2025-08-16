import { ExtractJwt, Strategy } from "passport-jwt"
import { PassportStrategy } from "@nestjs/passport"
import { Injectable, UnauthorizedException } from "@nestjs/common"
import type { ConfigService } from "@nestjs/config"
import type { AuthService } from "../auth.service"
import type { JwtPayload } from "../interfaces/jwt-payload.interface"

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("JWT_SECRET") || "dumosrx-secret-key",
    })
  }

  async validate(payload: JwtPayload) {
    const user = await this.authService.validateJwtPayload(payload)
    if (!user) {
      throw new UnauthorizedException()
    }
    return user
  }
}
