export type FieldErrors = Record<string, string[]>;

export type ActionErrorState = {
  status: "error";
  fieldErrors?: FieldErrors;
  globalError?: string;
};

export type ActionSuccessState<T extends object = object> = {
  status: "success";
  fieldErrors?: never;
  globalError?: never;
} & T;

export type ActionState<T extends object = object> =
  | ActionErrorState
  | ActionSuccessState<T>;

export const initialActionState: ActionErrorState = {
  status: "error",
};
