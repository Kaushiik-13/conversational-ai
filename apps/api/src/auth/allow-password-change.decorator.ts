import { SetMetadata } from '@nestjs/common';

export const ALLOW_PASSWORD_CHANGE_KEY = 'allowWhilePasswordChangeRequired';

/**
 * Marks a route that a signed-in user may call even while they still must
 * choose a new password (read profile, change password, sign out).
 */
export const AllowWhilePasswordChangeRequired = () =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_KEY, true);
