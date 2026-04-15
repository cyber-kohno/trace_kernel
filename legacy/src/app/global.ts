import { writable } from "svelte/store";
import type ToastUtil from "./util/item/toastUtit";

export const global = writable<{
    toastDisp?: (props: ToastUtil.Props) => void;
}>({});