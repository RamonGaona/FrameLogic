import type {
  LoadedModelInfo,
  ModelRole,
  ModelSource,
} from "./LoadedModel";
  
  
interface ModelEntry {

  id: string;

  name: string;

  source: ModelSource;

  role: ModelRole;

  visible: boolean;

  setVisible:
    (
      visible: boolean,
    ) => void;

  remove:
    () => void;

}
  
  export interface RegisterModelInput {
    id?: string;
  
    name: string;
  
    source: ModelSource;

    role: ModelRole;
  
    visible?: boolean;
  
    setVisible:
      (
        visible: boolean,
      ) => void;
  
    remove:
      () => void;
  }
  
  
  export class ModelRegistry {
  
    private readonly models =
      new Map<
        string,
        ModelEntry
      >();
  
  
    // ====================================================
    // REGISTER
    // ====================================================
  
    register(
      input: RegisterModelInput,
    ): LoadedModelInfo {
  
      const id =
        input.id
        ?? crypto.randomUUID();
  
  
      if (
        this.models.has(
          id,
        )
      ) {
  
        throw new Error(
          `A model with id "${id}" is already registered.`,
        );
  
      }
  
  
      const entry: ModelEntry = {
  
        id,
  
        name:
          input.name,
  
        source:
          input.source,

          role:
  input.role,
  
        visible:
          input.visible
          ?? true,
  
        setVisible:
          input.setVisible,
  
        remove:
          input.remove,
  
      };
  
  
      this.models.set(
        id,
        entry,
      );
  
  
      return this.toInfo(
        entry,
      );
    }
  
  
    // ====================================================
    // GET ALL
    // ====================================================
  
    getLoadedModels():
      LoadedModelInfo[] {
  
      return Array.from(
        this.models.values(),
        (
          model,
        ) =>
          this.toInfo(
            model,
          ),
      );
    }
  
  
    // ====================================================
    // GET ONE
    // ====================================================
  
    getModel(
      id: string,
    ):
      LoadedModelInfo
      | undefined {
  
      const model =
        this.models.get(
          id,
        );
  
  
      if (!model) {
        return undefined;
      }
  
  
      return this.toInfo(
        model,
      );
    }
  
  
    // ====================================================
    // VISIBILITY
    // ====================================================
  
    setModelVisible(
      id: string,
      visible: boolean,
    ): boolean {
  
      const model =
        this.models.get(
          id,
        );
  
  
      if (!model) {
        return false;
      }
  
  
      model.setVisible(
        visible,
      );
  
  
      model.visible =
        visible;
  
  
      return true;
    }
  
  
    // ====================================================
    // REMOVE
    // ====================================================
  
    removeModel(
      id: string,
    ): boolean {
  
      const model =
        this.models.get(
          id,
        );
  
  
      if (!model) {
        return false;
      }
  
  
      model.remove();
  
  
      this.models.delete(
        id,
      );
  
  
      return true;
    }
  
  
    // ====================================================
    // CLEAR
    // ====================================================
  
    clearModels(): void {
  
      for (
        const model
        of this.models.values()
      ) {
  
        model.remove();
  
      }
  
  
      this.models.clear();
    }
  
  
    // ====================================================
    // PRIVATE
    // ====================================================
  
    private toInfo(
      model: ModelEntry,
    ): LoadedModelInfo {
  
      return {
  
        id:
          model.id,
  
        name:
          model.name,
  
        source:
          model.source,

          role:
  model.role,
  
        visible:
          model.visible,
  
      };
    }
  }