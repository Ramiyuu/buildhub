import { api, html, dateBR, badge, optionsOf } from "/panel/ui.js";
import { kanbanView } from "./_kanban.js";

const PRIORITY = { alta: ["Alta", "danger"], media: ["Média", "warn"], baixa: ["Baixa", ""] };
const STATUSES = [{ key: "todo", label: "A fazer" }, { key: "doing", label: "Em andamento" }, { key: "done", label: "Concluídas" }];
const today = () => new Date().toISOString().slice(0, 10);

export default kanbanView({
  title: "Tarefas",
  subtitle: "Organização do dia a dia da equipe por projeto",
  endpoint: "/admin/tasks",
  addLabel: "Nova tarefa",
  statuses: STATUSES,
  loadExtras: async () => ({ projects: (await api("/admin/projects")).items, users: (await api("/admin/users").catch(() => ({ users: [] }))).users }),
  summary: (items) => {
    const open = items.filter((t) => t.status !== "done");
    const late = open.filter((t) => t.due_date && t.due_date < today());
    return html`<div class="row wrap"><span class="badge">${open.length} em aberto</span>${late.length ? html`<span class="badge danger">${late.length} atrasada(s)</span>` : html`<span class="badge ok">Sem atrasos</span>`}<span class="badge ok">${items.filter((t) => t.status === "done").length} concluída(s)</span></div>`;
  },
  card: (task) => {
    const late = task.status !== "done" && task.due_date && task.due_date < today();
    return html`<div class="t">${task.title}</div>
      <div class="muted small">${task.project_name || "Sem projeto"}</div>
      <div class="row wrap">${badge(PRIORITY[task.priority]?.[0] || task.priority, PRIORITY[task.priority]?.[1])}${task.due_date ? badge(dateBR(task.due_date), late ? "danger" : "") : ""}<span class="spacer"></span><span class="muted small">${task.assignee_name || ""}</span></div>`;
  },
  fields: (extras) => [
    { name: "title", label: "Tarefa", required: true, full: true },
    { name: "projectId", label: "Projeto", type: "select", options: optionsOf(extras.projects, { blank: "Sem projeto" }) },
    { name: "assigneeId", label: "Responsável", type: "select", options: optionsOf(extras.users, { blank: "Sem responsável" }) },
    { name: "priority", label: "Prioridade", type: "select", default: "media", options: Object.entries(PRIORITY).map(([value, [label]]) => ({ value, label })) },
    { name: "status", label: "Situação", type: "select", default: "todo", options: STATUSES.map((s) => ({ value: s.key, label: s.label })) },
    { name: "dueDate", label: "Prazo", type: "date" }
  ]
});
