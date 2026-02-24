// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

// Section header for grouping todos
export class TodoSection extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly isCompleted: boolean,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(label, collapsibleState);
    this.contextValue = "todoSection";
  }
}

// A simple model for a todo item
export class TodoItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public completed: boolean,
    public readonly id: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    // Set different contextValue based on completion state for menu filtering
    this.contextValue = this.completed
      ? "todoItemCompleted"
      : "todoItemOngoing";

    console.log(
      `TodoItem created: ${label}, completed: ${this.completed}, contextValue: ${this.contextValue}`,
    );

    // Create a fake URI for file decorations
    this.resourceUri = vscode.Uri.parse(`todo:${id}`);

    this.updateDecoration();
  }

  updateDecoration() {
    // Add icon to make items more visually distinct
    this.iconPath = new vscode.ThemeIcon(
      this.completed ? "check" : "circle-outline",
    );

    // Optional: add tooltip for more info
    this.tooltip = `${this.label}${this.completed ? " (completed)" : ""}`;

    // Set command to trigger on click/double-click
    this.command = {
      command: "todo-hub.renameTodo",
      title: "Rename Todo",
      arguments: [this],
    };
  }
}

// File decoration provider for completed todos
class TodoDecorationProvider implements vscode.FileDecorationProvider {
  private _onDidChangeFileDecorations = new vscode.EventEmitter<
    vscode.Uri | vscode.Uri[]
  >();
  readonly onDidChangeFileDecorations = this._onDidChangeFileDecorations.event;

  constructor(private provider: TodoProvider) {}

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    if (uri.scheme !== "todo") {
      return undefined;
    }

    const todoId = uri.path;
    const todos = this.provider.getTodos();
    const todo = todos.find((t) => t.id === todoId);

    if (todo && todo.completed) {
      return {
        propagate: false,
      };
    }

    return undefined;
  }

  refresh() {
    this._onDidChangeFileDecorations.fire(vscode.Uri.parse("todo:"));
  }
}

// Tree data provider for todos
export class TodoProvider implements vscode.TreeDataProvider<
  TodoSection | TodoItem
> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    TodoSection | TodoItem | undefined | void
  > = new vscode.EventEmitter<TodoSection | TodoItem | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<
    TodoSection | TodoItem | undefined | void
  > = this._onDidChangeTreeData.event;

  // maintain collapse/expand state for the sections so refreshing doesn't
  // reset them to defaults
  ongoingState: vscode.TreeItemCollapsibleState =
    vscode.TreeItemCollapsibleState.Expanded;
  completedState: vscode.TreeItemCollapsibleState =
    vscode.TreeItemCollapsibleState.Collapsed;

  constructor(private context: vscode.ExtensionContext) {}

  getTreeItem(element: TodoSection | TodoItem): vscode.TreeItem {
    if (element instanceof TodoItem) {
      // Ensure contextValue is explicitly set based on current state
      element.contextValue = element.completed
        ? "todoItemCompleted"
        : "todoItemOngoing";
      console.log(
        `getTreeItem called: ${element.label}, contextValue: ${element.contextValue}`,
      );
    }
    return element;
  }

  getChildren(element?: TodoSection): Thenable<(TodoSection | TodoItem)[]> {
    const todos = this.context.workspaceState.get<TodoRecord[]>("todos", []);

    if (!element) {
      // Root level: return sections, respecting previous collapse/expand state
      const ongoingCount = todos.filter((t) => !t.completed).length;
      const completedCount = todos.filter((t) => t.completed).length;

      return Promise.resolve([
        new TodoSection(`Ongoing (${ongoingCount})`, false, this.ongoingState),
        new TodoSection(
          `Completed (${completedCount})`,
          true,
          this.completedState,
        ),
      ]);
    } else {
      // Section level: return filtered todos
      const filteredTodos = todos.filter(
        (t) => t.completed === element.isCompleted,
      );
      return Promise.resolve(
        filteredTodos.map((t) => new TodoItem(t.label, t.completed, t.id)),
      );
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTodos(): TodoRecord[] {
    return this.context.workspaceState.get<TodoRecord[]>("todos", []);
  }

  addTodo(label: string) {
    const todos = this.context.workspaceState.get<TodoRecord[]>("todos", []);
    todos.push({ label, completed: false, id: Date.now().toString() });
    this.context.workspaceState.update("todos", todos);
    this.refresh();
  }

  removeTodo(id: string) {
    let todos = this.context.workspaceState.get<TodoRecord[]>("todos", []);
    todos = todos.filter((t) => t.id !== id);
    this.context.workspaceState.update("todos", todos);
    this.refresh();
  }

  toggleComplete(id: string) {
    const todos = this.context.workspaceState.get<TodoRecord[]>("todos", []);
    for (const t of todos) {
      if (t.id === id) {
        t.completed = !t.completed;
        break;
      }
    }
    this.context.workspaceState.update("todos", todos);
    this.refresh();
  }

  renameTodo(id: string, newLabel: string) {
    const todos = this.context.workspaceState.get<TodoRecord[]>("todos", []);
    for (const t of todos) {
      if (t.id === id) {
        t.label = newLabel;
        break;
      }
    }
    this.context.workspaceState.update("todos", todos);
    this.refresh();
  }

  undoComplete(id: string) {
    const todos = this.context.workspaceState.get<TodoRecord[]>("todos", []);
    for (const t of todos) {
      if (t.id === id) {
        t.completed = !t.completed;
        break;
      }
    }
    this.context.workspaceState.update("todos", todos);
    this.refresh();
  }
}

interface TodoRecord {
  label: string;
  completed: boolean;
  id: string;
}

// This method is called when your extension is activated
// Your extension is activated when the tree view or a todo command is executed
export function activate(context: vscode.ExtensionContext) {
  console.log("Todo Hub active");

  const provider = new TodoProvider(context);
  const decorationProvider = new TodoDecorationProvider(provider);

  // register tree view with createTreeView to access badge API
  const treeView = vscode.window.createTreeView("todoHubView", {
    treeDataProvider: provider,
  });

  // keep track of section expansion state so we don't collapse them
  treeView.onDidCollapseElement((e) => {
    if (e.element instanceof TodoSection) {
      if (e.element.isCompleted) {
        provider.completedState = vscode.TreeItemCollapsibleState.Collapsed;
      } else {
        provider.ongoingState = vscode.TreeItemCollapsibleState.Collapsed;
      }
    }
  });
  treeView.onDidExpandElement((e) => {
    if (e.element instanceof TodoSection) {
      if (e.element.isCompleted) {
        provider.completedState = vscode.TreeItemCollapsibleState.Expanded;
      } else {
        provider.ongoingState = vscode.TreeItemCollapsibleState.Expanded;
      }
    }
  });

  // Function to update the badge with ongoing task count
  const updateBadge = () => {
    const todos = provider.getTodos();
    const ongoingCount = todos.filter((t) => !t.completed).length;
    if (ongoingCount > 0) {
      treeView.badge = {
        tooltip: `${ongoingCount} ongoing task${ongoingCount !== 1 ? "s" : ""}`,
        value: ongoingCount,
      };
    } else {
      treeView.badge = undefined;
    }
  };

  // Update badge on startup
  updateBadge();

  // register decoration provider for styling completed items
  context.subscriptions.push(
    treeView,
    vscode.window.registerFileDecorationProvider(decorationProvider),
  );

  // commands
  context.subscriptions.push(
    vscode.commands.registerCommand("todo-hub.addTodo", async () => {
      const label = await vscode.window.showInputBox({ prompt: "New todo" });
      if (label) {
        provider.addTodo(label);
        decorationProvider.refresh();
        updateBadge();
      }
    }),

    vscode.commands.registerCommand("todo-hub.removeTodo", (item: TodoItem) => {
      provider.removeTodo(item.id);
      decorationProvider.refresh();
      updateBadge();
    }),

    vscode.commands.registerCommand(
      "todo-hub.toggleComplete",
      (item: TodoItem) => {
        provider.toggleComplete(item.id);
        decorationProvider.refresh();
        updateBadge();
      },
    ),

    vscode.commands.registerCommand(
      "todo-hub.undoComplete",
      (item: TodoItem) => {
        provider.toggleComplete(item.id);
        decorationProvider.refresh();
        updateBadge();
      },
    ),

    vscode.commands.registerCommand("todo-hub.refresh", () => {
      provider.refresh();
      decorationProvider.refresh();
      updateBadge();
    }),

    vscode.commands.registerCommand(
      "todo-hub.renameTodo",
      async (item: TodoItem) => {
        const newLabel = await vscode.window.showInputBox({
          prompt: "Rename todo",
          value: item.label,
        });
        if (newLabel && newLabel.trim() !== "") {
          provider.renameTodo(item.id, newLabel.trim());
          decorationProvider.refresh();
        }
      },
    ),

    // keep console command for compatibility
    vscode.commands.registerCommand("todo-hub.helloWorld", () => {
      vscode.window.showInformationMessage("Hello World from Todo Hub!");
    }),
  );
}

// This method is called when your extension is deactivated
export function deactivate() {}
