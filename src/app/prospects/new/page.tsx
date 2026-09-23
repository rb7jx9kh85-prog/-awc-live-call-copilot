import { redirect } from 'next/navigation';
import Nav from '@/components/Nav';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Champs de la fiche prospect, dans l'ordre du cahier des charges (§9). */
const FIELDS: { name: string; label: string; type?: 'text' | 'textarea'; required?: boolean }[] = [
  { name: 'company', label: 'Entreprise', required: true },
  { name: 'first_name', label: 'Prénom' },
  { name: 'last_name', label: 'Nom' },
  { name: 'website', label: 'Site web' },
  { name: 'sector', label: 'Secteur' },
  { name: 'phone', label: 'Téléphone' },
  { name: 'offer', label: 'Offre proposée' },
  { name: 'price', label: 'Prix' },
  { name: 'script', label: 'Script utilisé' },
  { name: 'objective', label: 'Objectif du call' },
  { name: 'problems', label: 'Problèmes identifiés', type: 'textarea' },
  { name: 'weaknesses', label: 'Faiblesses digitales', type: 'textarea' },
  { name: 'prior_info', label: 'Informations récupérées précédemment', type: 'textarea' },
  { name: 'notes', label: 'Notes personnelles', type: 'textarea' },
];

export default function NewProspectPage() {
  async function create(formData: FormData) {
    'use server';

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect('/login');

    const company = String(formData.get('company') ?? '').trim();
    if (!company) return;

    const row: Record<string, string | null> = { };
    for (const field of FIELDS) {
      const value = String(formData.get(field.name) ?? '').trim();
      row[field.name] = value || null;
    }
    row.company = company;

    const { error } = await supabase.from('prospects').insert({ ...row, owner_id: user.id });
    if (error) throw new Error(error.message);

    redirect('/prospects');
  }

  return (
    <>
      <Nav current="/prospects" />
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="mb-5 text-lg font-semibold">Nouveau prospect</h1>

        <form action={create} className="space-y-4">
          {FIELDS.map((f) => (
            <div key={f.name}>
              <label htmlFor={f.name} className="label mb-1.5 block">
                {f.label}
                {f.required && ' *'}
              </label>
              {f.type === 'textarea' ? (
                <textarea id={f.name} name={f.name} rows={2} className="field resize-none" />
              ) : (
                <input id={f.name} name={f.name} required={f.required} className="field" />
              )}
            </div>
          ))}

          <button type="submit" className="btn btn-primary">
            Créer la fiche
          </button>
        </form>
      </main>
    </>
  );
}
