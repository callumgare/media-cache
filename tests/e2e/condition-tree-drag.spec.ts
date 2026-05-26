import { expect, test } from "./fixtures";
import { setup } from "./helpers";

// ---------------------------------------------------------------------------
// Condition tree – drag and drop into empty group
// ---------------------------------------------------------------------------

test.describe("Condition tree – drag and drop", () => {
  test.beforeEach(async ({ request }) => {
    await setup({ request });
  });

  test("can drag a condition into an empty group", async ({ page }) => {
    await page.goto("/media/grid");

    // Open the filter sidebar edit mode.
    const editBtn = page.getByRole("button", { name: "Edit" });
    await expect(editBtn).toBeVisible({ timeout: 10_000 });
    await editBtn.click();

    // The condition tree should now be visible. Confirm at least one condition row is present.
    const tree = page.locator(".condition-tree");
    await expect(tree).toBeVisible({ timeout: 5_000 });

    // Add a subgroup (which starts empty).
    const addSubgroupBtn = page.getByTestId("root-add-subgroup");
    await expect(addSubgroupBtn).toBeVisible();
    await addSubgroupBtn.click();

    // The empty group should show the empty message.
    const emptyMessage = page.locator(".empty-group-message");
    await expect(emptyMessage).toBeVisible({ timeout: 3_000 });
    await expect(emptyMessage).toHaveText("- Group is empty -");

    // Locate the first draggable condition node and the empty group's drop zone.
    // PrimeVue Tree marks draggable rows with the p-tree-node-content class.
    // We want the first field-type node (leaf), not the group we just added.
    const fieldNode = tree
      .locator(".p-tree-node-leaf .p-tree-node-content")
      .first();
    await expect(fieldNode).toBeVisible({ timeout: 3_000 });

    // The drop target is the empty group node itself.
    const groupNode = tree
      .locator(".p-tree-node:not(.p-tree-node-leaf)")
      .first();
    await expect(groupNode).toBeVisible();

    // Perform the drag-and-drop.
    await page.dragAndDrop(
      ".p-tree-node-leaf .p-tree-node-content",
      ".p-tree-node:not(.p-tree-node-leaf) .p-tree-node-content",
    );

    // After the drop the "No conditions" message should be gone,
    // meaning the group is no longer empty.
    await expect(emptyMessage).not.toBeVisible({ timeout: 3_000 });

    // The group's children container should now contain a condition.
    const groupChildren = groupNode.locator(
      ".p-tree-node-children .p-tree-node-leaf",
    );
    await expect(groupChildren).toHaveCount(1, { timeout: 3_000 });
  });
});
