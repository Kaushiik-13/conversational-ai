export interface AuthenticatedSession {
  sessionId: string;
  userId: string;
  email: string;
  displayName: string;
  authorizationVersion: number;
  selectedMembershipId: string | null;
  csrfTokenHash: string;
}

export interface MembershipProfile {
  membershipId: string;
  organizationId: string;
  organizationCode: string;
  organizationName: string;
  role: string;
  isDefault: boolean;
  isSelected: boolean;
}

export interface AuthProfile {
  user: {
    id: string;
    email: string;
    displayName: string;
  };
  activeContext: {
    organizationId: string;
    organizationCode: string;
    organizationName: string;
    membershipId: string;
    role: string;
  } | null;
  memberships: MembershipProfile[];
  capabilities: string[];
}
