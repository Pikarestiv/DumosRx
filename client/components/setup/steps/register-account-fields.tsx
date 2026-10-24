"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STORE_TYPES = [
  { value: "pharmacy", label: "Pharmacy" },
  { value: "supermarket", label: "Supermarket" },
  { value: "grocery", label: "Grocery" },
  { value: "general", label: "General Store" },
];

interface RegisterAccountFieldsProps {
  storeType: string;
  setStoreType: (value: string) => void;
  email: string;
  setEmail: (value: string) => void;
  phone: string;
  setPhone: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  confirmPassword: string;
  setConfirmPassword: (value: string) => void;
  passwordError: string;
  clearPasswordError: () => void;
}

export function RegisterAccountFields({
  storeType,
  setStoreType,
  email,
  setEmail,
  phone,
  setPhone,
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  passwordError,
  clearPasswordError,
}: RegisterAccountFieldsProps) {
  return (
    <>
      <div className="space-y-1">
        <Label htmlFor="store-type" className="text-xs">
          Store Type
        </Label>
        <select
          id="store-type"
          className="w-full h-10 bg-background/50 border border-input rounded-md px-3 text-sm focus:ring-2 focus:ring-primary outline-none transition-all"
          value={storeType}
          onChange={(e) => setStoreType(e.target.value)}
        >
          {STORE_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="reg-email" className="text-xs">
          Email Address
        </Label>
        <Input
          id="reg-email"
          type="email"
          placeholder="your@email.com"
          className="bg-background/50 h-10 lowercase"
          value={email}
          onChange={(e) => setEmail(e.target.value.toLowerCase())}
          required
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="reg-phone" className="text-xs">
          Phone Number
        </Label>
        <Input
          id="reg-phone"
          type="tel"
          placeholder="08012345678"
          className="bg-background/50 h-10"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          minLength={10}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="reg-password" className="text-xs">
          Password
        </Label>
        <Input
          id="reg-password"
          type="password"
          placeholder="••••••••"
          className="bg-background/50 h-10"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            clearPasswordError();
          }}
          required
          minLength={8}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="reg-password-confirm" className="text-xs">
          Confirm Password
        </Label>
        <Input
          id="reg-password-confirm"
          type="password"
          placeholder="••••••••"
          className="bg-background/50 h-10"
          value={confirmPassword}
          onChange={(e) => {
            setConfirmPassword(e.target.value);
            clearPasswordError();
          }}
          required
          minLength={8}
        />
        {passwordError && (
          <p className="text-xs text-destructive">{passwordError}</p>
        )}
      </div>
    </>
  );
}
