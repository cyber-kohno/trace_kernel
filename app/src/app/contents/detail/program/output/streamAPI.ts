
export type StreamAPI = {
    receiveStream: () => Promise<void>;
    init: () => void;
    end: () => void;
}