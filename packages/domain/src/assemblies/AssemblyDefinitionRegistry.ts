import {
  createIdentityTransform3D,
} from "@framelogic/geometry";

import type {
  Transform3D,
} from "@framelogic/geometry";

import type {
  AssemblyConstraint,
  AssemblyConstraintType,
  AssemblyDefinition,
} from "./AssemblyDefinition";


export interface RegisterAssemblyDefinitionInput {
  readonly id?: string;
  readonly code: string;
  readonly name: string;
  readonly revision?: string;
  readonly classification?: string;
  readonly tags?: readonly string[];
  readonly currency?: string;
  readonly assemblyCost?: number;
}


export interface AddAssemblyComponentInput {
  readonly id?: string;
  readonly pieceDefinitionId: string;
  readonly transform?: Transform3D;
}


export interface AddAssemblyConstraintInput {
  readonly id?: string;
  readonly type: AssemblyConstraintType;
  readonly first: AssemblyConstraint["first"];
  readonly second: AssemblyConstraint["second"];
  readonly offset?: number;
  readonly enabled?: boolean;
}


export class AssemblyDefinitionRegistry {
  private readonly definitions =
    new Map<string, AssemblyDefinition>();


  register(
    input: RegisterAssemblyDefinitionInput,
  ): AssemblyDefinition {
    if (
      this.findByCode(input.code)
    ) {
      throw new Error(
        `An assembly definition with code "${input.code}" already exists.`,
      );
    }

    const id =
      input.id
      ?? crypto.randomUUID();

    if (
      this.definitions.has(id)
    ) {
      throw new Error(
        `An assembly definition with id "${id}" already exists.`,
      );
    }

    const definition:
      AssemblyDefinition = {
        id,
        code:
          input.code,
        name:
          input.name,
        revision:
          input.revision,
        classification:
          input.classification,
        tags: [
          ...(input.tags ?? []),
        ],
        components: [],
        constraints: [],
        currency:
          input.currency,
        assemblyCost:
          input.assemblyCost,
      };

    this.definitions.set(
      id,
      definition,
    );

    return definition;
  }


  get(
    id: string,
  ): AssemblyDefinition | undefined {
    return this.definitions.get(id);
  }


  getAll(): AssemblyDefinition[] {
    return Array.from(
      this.definitions.values(),
    );
  }


  findByCode(
    code: string,
  ): AssemblyDefinition | undefined {
    const normalized =
      code.trim().toLowerCase();

    return this.getAll()
      .find(
        (
          definition,
        ) =>
          definition.code
            .trim()
            .toLowerCase()
          === normalized,
      );
  }


  addComponent(
    assemblyDefinitionId: string,
    input: AddAssemblyComponentInput,
  ): AssemblyDefinition | undefined {
    const current =
      this.definitions.get(
        assemblyDefinitionId,
      );

    if (!current) {
      return undefined;
    }

    const componentId =
      input.id
      ?? crypto.randomUUID();

    if (
      current.components.some(
        (
          component,
        ) =>
          component.id === componentId,
      )
    ) {
      throw new Error(
        `Assembly component "${componentId}" already exists.`,
      );
    }

    const updated:
      AssemblyDefinition = {
        ...current,
        components: [
          ...current.components,
          {
            id:
              componentId,
            pieceDefinitionId:
              input.pieceDefinitionId,
            transform:
              input.transform
              ?? createIdentityTransform3D(),
          },
        ],
      };

    this.definitions.set(
      assemblyDefinitionId,
      updated,
    );

    return updated;
  }


  addConstraint(
    assemblyDefinitionId: string,
    input: AddAssemblyConstraintInput,
  ): AssemblyDefinition | undefined {
    const current =
      this.definitions.get(
        assemblyDefinitionId,
      );

    if (!current) {
      return undefined;
    }

    this.assertComponentExists(
      current,
      input.first.componentId,
    );
    this.assertComponentExists(
      current,
      input.second.componentId,
    );

    const constraintId =
      input.id
      ?? crypto.randomUUID();

    if (
      current.constraints.some(
        (
          constraint,
        ) =>
          constraint.id === constraintId,
      )
    ) {
      throw new Error(
        `Assembly constraint "${constraintId}" already exists.`,
      );
    }

    const updated:
      AssemblyDefinition = {
        ...current,
        constraints: [
          ...current.constraints,
          {
            id:
              constraintId,
            type:
              input.type,
            first: {
              ...input.first,
            },
            second: {
              ...input.second,
            },
            offset:
              input.offset,
            enabled:
              input.enabled
              ?? true,
          },
        ],
      };

    this.definitions.set(
      assemblyDefinitionId,
      updated,
    );

    return updated;
  }


  remove(
    id: string,
  ): boolean {
    return this.definitions.delete(id);
  }


  clear(): void {
    this.definitions.clear();
  }


  private assertComponentExists(
    definition: AssemblyDefinition,
    componentId: string,
  ): void {
    if (
      !definition.components.some(
        (
          component,
        ) =>
          component.id === componentId,
      )
    ) {
      throw new Error(
        `Assembly component "${componentId}" does not exist.`,
      );
    }
  }
}
