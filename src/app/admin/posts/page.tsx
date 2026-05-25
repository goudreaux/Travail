'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Post, Member } from '@/lib/supabase/types'

type PostRow = Post & { author: Pick<Member, 'name' | 'initials'> | null }

// Travail Ops system author ID — a fixed UUID used for all ops posts
const OPS_AUTHOR_ID = '00000000-0000-0000-0000-000000000001'

function Toast({ msg, kind }: { msg: string; kind: 'success' | 'error' | 'info' }) {
  return <div className={`toast ${kind}`}>{msg}</div>
}

export default function PostsPage() {
  const supabase = createClient()
  const [posts, setPosts] = useState<PostRow[]>([])
  const [members, setMembers] = useState<Pick<Member, 'id' | 'name' | 'initials'>[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'error' | 'info' } | null>(null)

  // Form state
  const [authorKind, setAuthorKind] = useState<'ops' | 'member'>('ops')
  const [authorMemberId, setAuthorMemberId] = useState('')
  const [kind, setKind] = useState<Post['kind']>('text')
  const [body, setBody] = useState('')
  const [quote, setQuote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const showToast = (msg: string, k: 'success' | 'error' | 'info' = 'success') => {
    setToast({ msg, kind: k })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: postData }, { data: memberData }] = await Promise.all([
      supabase
        .from('posts')
        .select('*, author:members!author_id(name, initials)')
        .order('created_at', { ascending: false })
        .limit(100),
      supabase.from('members').select('id, name, initials').order('name'),
    ])
    setPosts((postData ?? []) as unknown as PostRow[])
    setMembers(memberData ?? [])
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  async function submit() {
    if (!body.trim()) return
    setSubmitting(true)
    try {
      const authorId = authorKind === 'ops' ? OPS_AUTHOR_ID : authorMemberId
      if (!authorId) { showToast('Select a member author', 'error'); return }

      const { error } = await supabase.from('posts').insert({
        author_id: authorId,
        author_kind: authorKind === 'ops' ? 'system' : 'member',
        body: body.trim(),
        quote: quote.trim() || null,
        kind,
      })
      if (error) throw error

      showToast('Post published')
      setBody('')
      setQuote('')
      setKind('text')
      setAuthorKind('ops')
      setAuthorMemberId('')
      load()
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Failed to post', 'error')
    } finally { setSubmitting(false) }
  }

  async function deletePost(id: string) {
    setDeleting(id)
    try {
      const { error } = await supabase.from('posts').delete().eq('id', id)
      if (error) throw error
      showToast('Post deleted')
      setConfirmDelete(null)
      load()
    } catch (e: unknown) {
      showToast((e as Error).message ?? 'Delete failed', 'error')
    } finally { setDeleting(null) }
  }

  const kindColor: Record<string, string> = {
    text: 'ink', trip_report: 'tropic', announcement: 'sun', photo: 'moss',
  }

  return (
    <div className="admin-page">
      {toast && <Toast msg={toast.msg} kind={toast.kind} />}

      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(6,56,71,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--card)', borderRadius: 14, padding: 28, width: 380, boxShadow: '0 16px 64px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontFamily: 'var(--display)', fontSize: 20, color: 'var(--ink)', margin: '0 0 12px' }}>Delete Post?</h3>
            <p style={{ fontSize: 13, color: 'var(--ink-light)', margin: '0 0 20px' }}>This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button
                className="btn-primary"
                style={{ background: 'var(--signal)' }}
                disabled={deleting === confirmDelete}
                onClick={() => deletePost(confirmDelete)}
              >
                {deleting === confirmDelete ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: 'var(--display)', fontSize: 30, fontWeight: 500, color: 'var(--ink)', margin: 0 }}>Feed Posts</h1>
        <p style={{ fontSize: 13, color: 'var(--ink-light)', marginTop: 4, marginBottom: 0 }}>Create and manage posts in the member feed.</p>
      </div>

      {/* New post form */}
      <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 14, padding: 24, marginBottom: 28 }}>
        <h3 style={{ fontFamily: 'var(--display)', fontSize: 20, margin: '0 0 20px', color: 'var(--ink)' }}>New Post</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div className="field">
            <label className="field-lab">Author</label>
            <select className="select" value={authorKind} onChange={e => setAuthorKind(e.target.value as 'ops' | 'member')}>
              <option value="ops">Travail Ops (system)</option>
              <option value="member">Specific Member</option>
            </select>
          </div>
          {authorKind === 'member' && (
            <div className="field">
              <label className="field-lab">Member</label>
              <select className="select" value={authorMemberId} onChange={e => setAuthorMemberId(e.target.value)}>
                <option value="">Select member…</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label className="field-lab">Post Kind</label>
            <select className="select" value={kind} onChange={e => setKind(e.target.value as Post['kind'])}>
              <option value="text">Text</option>
              <option value="announcement">Announcement</option>
              <option value="trip_report">Trip Report</option>
              <option value="photo">Photo</option>
            </select>
          </div>
        </div>
        <div className="field" style={{ marginBottom: 16 }}>
          <label className="field-lab">Body <span className="req">*</span></label>
          <textarea
            className="input"
            style={{ minHeight: 100 }}
            placeholder="Write your post content here…"
            value={body}
            onChange={e => setBody(e.target.value)}
          />
        </div>
        <div className="field" style={{ marginBottom: 20 }}>
          <label className="field-lab">Quote (optional italic highlight)</label>
          <input
            className="input"
            placeholder="A memorable phrase or pull quote…"
            value={quote}
            onChange={e => setQuote(e.target.value)}
          />
        </div>

        {/* Preview */}
        {body && (
          <div style={{ background: 'var(--warm)', border: '1px solid var(--hair)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 10.5, fontFamily: 'var(--mono)', letterSpacing: '0.12em', color: 'var(--ink-light)', marginBottom: 10, textTransform: 'uppercase' }}>Preview</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--night)', color: 'var(--tropic)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                {authorKind === 'ops' ? 'T' : members.find(m => m.id === authorMemberId)?.initials ?? '?'}
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>
                  {authorKind === 'ops' ? 'Travail Ops' : (members.find(m => m.id === authorMemberId)?.name ?? 'Member')}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-light)' }}>Just now · {kind.replace('_', ' ')}</div>
              </div>
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--ink-soft)', margin: 0 }}>{body}</p>
            {quote && (
              <div className="post" style={{ background: 'none', border: 'none', padding: 0 }}>
                <blockquote className="quote" style={{ margin: '10px 0 0' }}>{quote}</blockquote>
              </div>
            )}
          </div>
        )}

        <button
          className="btn-primary"
          onClick={submit}
          disabled={submitting || !body.trim() || (authorKind === 'member' && !authorMemberId)}
        >
          {submitting ? 'Publishing…' : 'Publish Post'}
        </button>
      </div>

      {/* Posts table */}
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 500, margin: 0, color: 'var(--ink)' }}>
          All Posts <span style={{ fontFamily: 'var(--ui)', fontSize: 14, fontWeight: 400, color: 'var(--ink-light)' }}>{posts.length}</span>
        </h2>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--ink-light)', fontSize: 14 }}>Loading…</div>
      ) : (
        <div style={{ background: 'var(--card)', border: '1px solid var(--hair)', borderRadius: 12, overflow: 'hidden' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Author</th>
                <th>Kind</th>
                <th style={{ width: '40%' }}>Body</th>
                <th>Quote</th>
                <th>Likes</th>
                <th>Posted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {posts.map(p => (
                <tr key={p.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: p.author_kind === 'system' ? 'var(--night)' : 'var(--tropic-glow)', color: p.author_kind === 'system' ? 'var(--tropic)' : 'var(--tropic-d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                        {p.author_kind === 'system' ? 'T' : (p.author?.initials ?? '?')}
                      </div>
                      <span style={{ fontWeight: 500, color: 'var(--ink)', fontSize: 13 }}>
                        {p.author_kind === 'system' ? 'Travail Ops' : (p.author?.name ?? 'Unknown')}
                      </span>
                    </div>
                  </td>
                  <td><span className={`pill ${kindColor[p.kind]}`}>{p.kind.replace('_', ' ')}</span></td>
                  <td style={{ fontSize: 12.5, color: 'var(--ink-soft)', maxWidth: 280 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.body}</div>
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--ink-light)', fontStyle: 'italic', maxWidth: 140 }}>
                    {p.quote ? (
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.quote}</div>
                    ) : '—'}
                  </td>
                  <td style={{ fontWeight: 600, color: 'var(--ink)' }}>{p.likes}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-light)' }}>
                    {new Date(p.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td>
                    <button
                      className="btn-ghost"
                      style={{ height: 28, padding: '0 10px', fontSize: 12, color: 'var(--signal)', borderColor: 'rgba(217,78,42,0.2)' }}
                      disabled={deleting === p.id}
                      onClick={() => setConfirmDelete(p.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {posts.length === 0 && (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--ink-light)', fontSize: 13 }}>No posts yet.</div>
          )}
        </div>
      )}
    </div>
  )
}
