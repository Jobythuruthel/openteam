/** Injectable time source so expiry rules can be tested without sleeping. */
export const CLOCK = Symbol('CLOCK');
export type Clock = () => Date;
export const systemClock: Clock = () => new Date();
