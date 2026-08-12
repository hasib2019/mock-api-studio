"use client";

/**
 * Project list: the grid, the create/edit modal and the cascading delete
 * confirmation. All writes go through the admin API and are followed by a
 * `router.refresh()` so the server component re-reads the JSON store.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { toast } from "@/components/toast";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  KeyValueEditor,
  Modal,
  SectionHeader,
  Textarea,
} from "@/components/ui";
import { ApiError, adminApi } from "@/lib/api-client";
import { PROJECT_COLORS } from "@/lib/defaults";
import { slugify } from "@/lib/ids";
import type { ProjectDef } from "@/lib/types";

export interface ProjectRow extends ProjectDef {
  endpointCount: number;
  enabledCount: number;
}

export interface ProjectsViewProps {
  projects: ProjectRow[];
  /** dashboard links here with ?new=1 to open the create modal straight away */
  initialCreate?: boolean;
}

interface ProjectForm {
  name: string;
  slug: string;
  description: string;
  color: string;
  defaultHeaders: Record<string, string>;
}

interface FormErrors {
  name?: string;
  slug?: string;
}

function emptyForm(): ProjectForm {
  return {
    name: "",
    slug: "",
    description: "",
    color: PROJECT_COLORS[0],
    defaultHeaders: {},
  };
}

function formFrom(project: ProjectRow): ProjectForm {
  return {
    name: project.name,
    slug: project.slug,
    description: project.description ?? "",
    color: project.color,
    defaultHeaders: { ...project.defaultHeaders },
  };
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function IconFolder({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" aria-hidden="true">
      <path
        d="M2.75 6.25a1.5 1.5 0 011.5-1.5h2.9c.4 0 .78.16 1.06.44l1.06 1.06h6.48a1.5 1.5 0 011.5 1.5v6.5a1.5 1.5 0 01-1.5 1.5H4.25a1.5 1.5 0 01-1.5-1.5v-8z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ProjectsView({ projects, initialCreate = false }: ProjectsViewProps) {
  const router = useRouter();

  const [formOpen, setFormOpen] = React.useState(initialCreate);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<ProjectForm>(emptyForm);
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [errors, setErrors] = React.useState<FormErrors>({});
  const [saving, setSaving] = React.useState(false);

  const [deleteTarget, setDeleteTarget] = React.useState<ProjectRow | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  function patchForm(patch: Partial<ProjectForm>) {
    setForm((current) => ({ ...current, ...patch }));
  }

  function openCreate() {
    setEditingId(null);
    setForm(emptyForm());
    setSlugTouched(false);
    setErrors({});
    setFormOpen(true);
  }

  function openEdit(project: ProjectRow) {
    setEditingId(project.id);
    setForm(formFrom(project));
    setSlugTouched(true);
    setErrors({});
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
  }

  function onNameChange(name: string) {
    patchForm(slugTouched ? { name } : { name, slug: slugify(name) });
  }

  async function save() {
    const name = form.name.trim();
    const slug = slugify(form.slug.trim() || name);
    const nextErrors: FormErrors = {};
    if (!name) nextErrors.name = "Give the project a name";
    if (!slug) nextErrors.slug = "The URL slug cannot be empty";
    setErrors(nextErrors);
    if (nextErrors.name || nextErrors.slug) return;

    const payload = {
      name,
      slug,
      description: form.description.trim(),
      color: form.color,
      defaultHeaders: form.defaultHeaders,
    };

    setSaving(true);
    try {
      if (editingId) {
        await adminApi.updateProject(editingId, payload);
        toast(`Project "${name}" updated`, "success");
      } else {
        await adminApi.createProject(payload);
        toast(`Project "${name}" created`, "success");
      }
      setFormOpen(false);
      router.refresh();
    } catch (err) {
      toast(errorMessage(err, "Could not save the project"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await adminApi.deleteProject(deleteTarget.id);
      toast(`Project "${deleteTarget.name}" deleted`, "success");
      setDeleteTarget(null);
      router.refresh();
    } catch (err) {
      toast(errorMessage(err, "Could not delete the project"), "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <SectionHeader
        title="Projects"
        description="A project groups endpoints under one mock URL namespace and a shared set of response headers."
        actions={
          <Button size="sm" onClick={openCreate}>
            New project
          </Button>
        }
      />

      {projects.length === 0 ? (
        <EmptyState
          icon={<IconFolder className="h-5 w-5" />}
          title="No projects yet"
          description="Create your first project to claim a /api/mock/<slug> namespace, then register endpoints, validation rules and response scenarios inside it."
          action={<Button onClick={openCreate}>Create project</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <article
              key={project.id}
              className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-colors hover:border-slate-300"
            >
              <div className="flex-1 p-4">
                <div className="flex items-start gap-2.5">
                  <span
                    className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: project.color }}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/projects/${project.id}`}
                      className="block truncate text-sm font-semibold text-slate-900 hover:text-indigo-700"
                    >
                      {project.name}
                    </Link>
                    <p className="mt-0.5 truncate font-mono text-[11.5px] text-slate-500">
                      /api/mock/{project.slug}
                    </p>
                  </div>
                </div>

                <p className="mt-2.5 line-clamp-2 min-h-[2.5rem] text-[13px] leading-5 text-slate-500">
                  {project.description || "No description."}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <Badge tone="gray">
                    {project.endpointCount} endpoint{project.endpointCount === 1 ? "" : "s"}
                  </Badge>
                  <Badge tone={project.enabledCount > 0 ? "green" : "gray"}>
                    {project.enabledCount} enabled
                  </Badge>
                  {Object.keys(project.defaultHeaders).length > 0 ? (
                    <Badge tone="blue">
                      {Object.keys(project.defaultHeaders).length} default header
                      {Object.keys(project.defaultHeaders).length === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                </div>
              </div>

              <footer className="flex items-center justify-between gap-2 border-t border-slate-200 bg-slate-50 px-4 py-2.5">
                <Link href={`/projects/${project.id}`}>
                  <Button variant="secondary" size="sm">
                    Open
                  </Button>
                </Link>
                <div className="flex items-center gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(project)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => setDeleteTarget(project)}
                  >
                    Delete
                  </Button>
                </div>
              </footer>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={closeForm}
        wide
        title={editingId ? "Edit project" : "New project"}
        description={
          editingId
            ? "Renaming the slug changes the mock URL of every endpoint in this project."
            : "The slug becomes the URL prefix every endpoint of this project answers on."
        }
        footer={
          <>
            <Button variant="secondary" onClick={closeForm} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} loading={saving}>
              {editingId ? "Save changes" : "Create project"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Name"
            required
            placeholder="NPSB Fund Transfer"
            value={form.name}
            error={errors.name}
            onChange={(event) => onNameChange(event.target.value)}
          />

          <Input
            label="URL slug"
            required
            mono
            placeholder="npsb-fund-transfer"
            value={form.slug}
            error={errors.slug}
            hint={`Mock base URL: /api/mock/${slugify(form.slug || form.name) || "<slug>"}`}
            onChange={(event) => {
              setSlugTouched(true);
              patchForm({ slug: event.target.value });
            }}
          />

          <Textarea
            label="Description"
            rows={3}
            placeholder="Interbank fund transfer sandbox — NPSB inward and outward flows."
            value={form.description}
            onChange={(event) => patchForm({ description: event.target.value })}
          />

          <div>
            <p className="mb-1.5 text-[13px] leading-4 font-medium text-slate-700">Colour</p>
            <div className="flex flex-wrap items-center gap-2">
              {PROJECT_COLORS.map((color) => {
                const active = form.color.toLowerCase() === color.toLowerCase();
                return (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Use colour ${color}`}
                    aria-pressed={active}
                    onClick={() => patchForm({ color })}
                    className={`h-7 w-7 rounded-full transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${
                      active
                        ? "scale-110 ring-2 ring-slate-900 ring-offset-2"
                        : "ring-1 ring-slate-200 hover:scale-105"
                    }`}
                    style={{ backgroundColor: color }}
                  />
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-[13px] leading-4 font-medium text-slate-700">
              Default response headers
            </p>
            <p className="mb-2 text-xs leading-4 text-slate-500">
              Merged into every response returned by this project. Scenario headers win on conflict.
            </p>
            <KeyValueEditor
              value={form.defaultHeaders}
              onChange={(defaultHeaders) => patchForm({ defaultHeaders })}
              keyPlaceholder="x-channel"
              valuePlaceholder="sandbox"
              addLabel="Add header"
            />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete project"
        message={
          deleteTarget
            ? `Deleting "${deleteTarget.name}" also removes ${deleteTarget.endpointCount} registered endpoint${
                deleteTarget.endpointCount === 1 ? "" : "s"
              } and frees the slug /api/mock/${deleteTarget.slug}. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete project"
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      />
    </div>
  );
}

export default ProjectsView;
