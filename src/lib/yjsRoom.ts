import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import { fetchIceServers, loadSignalingUrls, type TurnState } from "./turnConfig";

export type TagNote = {
  id: string; // unique within tag
  text: string;
  authorId: string;
  authorName: string;
  authorColor: string;
  createdAt: number;
};

// Notes per tag: tagId -> Y.Array<TagNote>
// Y.Map<Y.Array<TagNote>> would be the ideal type, but Yjs typing only lets us
// hold the Y.Array directly. We store as a Y.Map of plain note arrays for
// simplicity (whole-array replacement on add/remove). For richer concurrent
// edit semantics, swap to nested Y.Array later.

export type Room = {
  doc: Y.Doc;
  provider: WebrtcProvider;
  notesByTag: Y.Map<TagNote[]>;
  turnState: TurnState;
  signalingUrl: string;
  destroy: () => void;
};

export async function joinRoom(
  roomCode: string,
  password: string | undefined,
): Promise<Room> {
  const turnState = await fetchIceServers();
  const signalingUrls = loadSignalingUrls();

  const doc = new Y.Doc();
  const notesByTag = doc.getMap<TagNote[]>("notesByTag");

  const provider = new WebrtcProvider(`tagboard:${roomCode}`, doc, {
    signaling: signalingUrls,
    password: password || undefined,
    peerOpts: { config: { iceServers: turnState.iceServers } },
    maxConns: 24,
  });

  return {
    doc,
    provider,
    notesByTag,
    turnState,
    signalingUrl: signalingUrls[0],
    destroy: () => {
      provider.destroy();
      doc.destroy();
    },
  };
}
