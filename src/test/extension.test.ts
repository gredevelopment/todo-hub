import * as assert from "assert";

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from "vscode";
import { TodoProvider, TodoSection, TodoItem } from "../extension";

suite("Extension Test Suite", () => {
  vscode.window.showInformationMessage("Start all tests.");

  test("TodoProvider should start with two sections and allow adding, toggling, and removing", async () => {
    class FakeState implements vscode.Memento {
      private data = new Map<string, any>();
      get<T>(key: string, defaultValue?: T): T | undefined {
        if (this.data.has(key)) {
          return this.data.get(key);
        }
        return defaultValue;
      }
      update(key: string, value: any): Thenable<void> {
        this.data.set(key, value);
        return Promise.resolve();
      }
      keys(): readonly string[] {
        return Array.from(this.data.keys());
      }
    }

    const fakeContext = {
      workspaceState: new FakeState(),
    } as unknown as vscode.ExtensionContext;
    const provider = new TodoProvider(fakeContext);

    // Root level should return two sections
    let sections = await provider.getChildren();
    assert.strictEqual(sections.length, 2);
    assert.ok(sections[0] instanceof TodoSection);
    assert.ok(sections[1] instanceof TodoSection);

    // Ongoing section should be empty initially
    const ongoingSection = sections[0] as TodoSection;
    let ongoingItems = await provider.getChildren(ongoingSection);
    assert.strictEqual(ongoingItems.length, 0);

    // Add a todo
    provider.addTodo("first");
    sections = await provider.getChildren();
    ongoingItems = await provider.getChildren(sections[0] as TodoSection);
    assert.strictEqual(ongoingItems.length, 1);
    assert.ok(ongoingItems[0] instanceof TodoItem);
    assert.strictEqual(ongoingItems[0].label, "first");

    // Toggle complete
    const firstItem = ongoingItems[0] as TodoItem;
    provider.toggleComplete(firstItem.id);

    // Should now be in completed section
    sections = await provider.getChildren();
    const completedSection = sections[1] as TodoSection;
    let completedItems = await provider.getChildren(completedSection);
    assert.strictEqual(completedItems.length, 1);
    assert.ok(completedItems[0] instanceof TodoItem);
    assert.strictEqual((completedItems[0] as TodoItem).completed, true);

    // Remove todo
    provider.removeTodo((completedItems[0] as TodoItem).id);
    sections = await provider.getChildren();
    completedItems = await provider.getChildren(sections[1] as TodoSection);
    assert.strictEqual(completedItems.length, 0);
  });
});
