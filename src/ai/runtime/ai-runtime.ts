import type { IEventBus } from "../../core/event-bus.js";
import { EventType } from "../../types/index.js";
import type { LiveSyncEvent, EventListener } from "../../types/index.js";
import type { EmbeddingIndexService } from "../services/index.js";
import type { SemanticSearchService } from "../services/index.js";
import logger from "../../utils/logger.js";

export class AIRuntime {
  private noteUpsertedListener: EventListener | null = null;
  private noteDeletedListener: EventListener | null = null;

  constructor(
    private readonly eventBus: IEventBus,
    private readonly indexService: EmbeddingIndexService,
    private readonly searchService: SemanticSearchService,
  ) {}

  start(): void {
    void this.indexService;

    this.noteUpsertedListener = async (event: LiveSyncEvent) => {
      logger.info(
        { noteId: event.payload?.noteId },
        "AI: NoteUpserted received (placeholder)",
      );
    };

    this.noteDeletedListener = async (event: LiveSyncEvent) => {
      logger.info(
        { noteId: event.payload?.noteId },
        "AI: NoteDeleted received (placeholder)",
      );
    };

    this.eventBus.subscribe(EventType.NoteUpserted, this.noteUpsertedListener);
    this.eventBus.subscribe(EventType.NoteDeleted, this.noteDeletedListener);

    logger.info("AI runtime started");
  }

  stop(): void {
    if (this.noteUpsertedListener) {
      this.eventBus.unsubscribe(
        EventType.NoteUpserted,
        this.noteUpsertedListener,
      );
      this.noteUpsertedListener = null;
    }
    if (this.noteDeletedListener) {
      this.eventBus.unsubscribe(
        EventType.NoteDeleted,
        this.noteDeletedListener,
      );
      this.noteDeletedListener = null;
    }

    logger.info("AI runtime stopped");
  }

  getSearchService(): SemanticSearchService {
    return this.searchService;
  }
}
