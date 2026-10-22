import { isValidCardNumber } from "@/lib/card-options";

export type CardNumberSave = {
  /** Edit of a card that already exists. Add card is false. */
  isEdit: boolean;
  noNumber: boolean;
  cardNumber: string;
};

/**
 * Blank is valid on edit. formValid is the gate that blocked the save: a blank
 * number fails isValidCardNumber, so submit returned before updateCard. The
 * number input is not natively required. Add still needs a number or the No
 * number checkbox. Any other value is checked with isValidCardNumber on the
 * raw input, which normalizes once.
 */
export function cardNumberAllowsSave(input: CardNumberSave): boolean {
  if (input.noNumber) return true;
  if (input.isEdit && input.cardNumber.trim() === "") return true;
  return isValidCardNumber(input.cardNumber);
}
