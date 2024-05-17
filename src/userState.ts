export const UserState = {
  Standby: 1,
  Invited: 2,
  Confirming: 3,
  Calling: 4,
  Talking: 5
} as const;

export type UserState = (typeof UserState)[keyof typeof UserState];
