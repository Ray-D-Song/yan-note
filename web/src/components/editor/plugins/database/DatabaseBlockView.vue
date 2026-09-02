<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useNodeViewContext } from '@prosemirror-adapter/vue'
import { useDatabasesStore } from '@/stores/databases'

const { node, selected } = useNodeViewContext()
const databasesStore = useDatabasesStore()
const loading = ref(false)

const databaseId = computed(() => String(node.value.attrs.databaseId ?? ''))

const database = computed(() =>
  databasesStore.currentDatabase?.id === databaseId.value
    ? databasesStore.currentDatabase
    : databasesStore.databases.find((item) => item.id === databaseId.value) ?? null,
)

const rows = computed(() => databasesStore.currentRows)
const properties = computed(() => databasesStore.currentProperties)

async function loadDatabase() {
  if (!databaseId.value) {
    return
  }
  loading.value = true
  try {
    await databasesStore.fetchDatabase(databaseId.value)
  } finally {
    loading.value = false
  }
}

async function addRow() {
  if (!databaseId.value) {
    return
  }
  await databasesStore.createRow(databaseId.value)
}

async function updateCell(rowId: string, propertyId: string, value: string) {
  if (!databaseId.value) {
    return
  }
  await databasesStore.updateCell(databaseId.value, rowId, propertyId, value)
}

onMounted(() => {
  void loadDatabase()
})

watch(databaseId, () => {
  void loadDatabase()
})
</script>

<template>
  <div
    class="yn-database-block-inner"
    :class="{ 'is-selected': selected }"
    contenteditable="false"
  >
    <div class="d-flex align-items-center justify-content-between px-3 py-2 border-bottom bg-light">
      <strong class="small mb-0">{{ database?.title ?? '数据库' }}</strong>
      <button
        class="btn btn-sm btn-outline-secondary"
        type="button"
        @click="addRow"
      >
        新建行
      </button>
    </div>

    <div v-if="loading" class="px-3 py-3 text-muted small">加载中...</div>
    <div v-else-if="!databaseId" class="px-3 py-3 text-muted small">
      未绑定数据库
    </div>
    <div v-else class="table-responsive">
      <table class="table table-sm mb-0 align-middle">
        <thead>
          <tr>
            <th v-for="property in properties" :key="property.id" class="small">
              {{ property.name }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="row.id">
            <td v-for="property in properties" :key="property.id">
              <input
                class="form-control form-control-sm border-0 bg-transparent"
                :value="row.cells[property.id] ?? ''"
                @change="updateCell(row.id, property.id, ($event.target as HTMLInputElement).value)"
              />
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td :colspan="Math.max(properties.length, 1)" class="text-muted small px-3 py-3">
              暂无数据，点击「新建行」开始
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.yn-database-block-inner.is-selected {
  outline: 2px solid rgba(35, 131, 226, 0.35);
}
</style>
