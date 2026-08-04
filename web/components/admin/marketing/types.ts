export interface ReferralSummary {
  total_referrals: number;
  total_credits_earned: number;
  total_credits_spent: number;
  active_referrers: number;
}

export interface ReferralProgramSettings {
  enabled: boolean;
  reward_percentage: number;
  reward_trigger: "first" | "recurring";
  allow_full_credit_payment: boolean;
}

export interface ReferralRelationship {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  created_at: string;
  referred_by: {
    first_name: string;
    last_name: string;
    referral_code: string;
  } | null;
  store: {
    name: string;
  } | null;
}

export interface CreditTransaction {
  id: string;
  type: "earned" | "spent" | "admin_adjustment";
  amount: string;
  description: string;
  created_at: string;
  user: {
    first_name: string;
    last_name: string;
    email: string;
  };
  referred_user: {
    first_name: string;
    last_name: string;
  } | null;
}
