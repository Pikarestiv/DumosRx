export interface JwtPayload {
  sub: string // user id
  email: string
  role: string
  firstName: string
  lastName: string
  iat?: number
  exp?: number
}
