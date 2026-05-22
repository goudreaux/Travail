'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Member } from '@/lib/supabase/types'

interface CommentDetail {
  id: string
  body: string
  created_at: string
  author?: { name: string; initials: string } | null
}

interface PostWithDetails {
  id: string
  author_id: string
  author_kind: string
  body: string
  quote: string | null
  kind: string
  likes: number
  created_at: string
  author?: { name: string; initials: string } | null
  comments?: CommentDetail[]
}

interface Props {
  post: PostWithDetails
  member: Member | null
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  const d = new Date(iso)
  return `${d.toLocaleString('default', { month: 'short' })} ${d.getDate()}`
}

export default function PostCard({ post, member }: Props) {
  const [liked, setLiked] = useState(false)
  const [likeCount, setLikeCount] = useState(post.likes ?? 0)
  const [showComments, setShowComments] = useState(false)
  const [comments, setComments] = useState<CommentDetail[]>(post.comments ?? [])
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const supabase = createClient()

  const isOps = post.author_kind === 'system'
  const isAnnouncement = post.kind === 'announcement'
  const isTripReport = post.kind === 'trip_report'

  // Derive pill label and color class
  let pillLabel = ''
  let pillClass = ''
  if (isOps || isAnnouncement) {
    pillLabel = 'OPS'
    pillClass = 'sun'
  } else if (post.kind === 'text' || post.kind === 'photo') {
    pillLabel = 'ANCHOR'
    pillClass = 'tropic'
  } else if (isTripReport) {
    pillLabel = 'TRIP'
    pillClass = 'moss'
  }

  // Avatar color: OPS = sun background, otherwise warm
  const avatarStyle = isOps || isAnnouncement
    ? { background: 'var(--sun)', color: 'var(--ink)' }
    : { background: 'var(--warm)', color: 'var(--ink-mid)' }

  const authorName = isOps ? 'Travail Ops' : (post.author?.name ?? 'Member')
  const authorInitials = isOps ? 'OPS' : (post.author?.initials ?? '?')

  const toggleLike = async () => {
    const newLiked = !liked
    setLiked(newLiked)
    setLikeCount(c => newLiked ? c + 1 : c - 1)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('posts') as any)
      .update({ likes: newLiked ? post.likes + 1 : post.likes - 1 })
      .eq('id', post.id)
  }

  const submitComment = async () => {
    if (!draft.trim() || !member || submitting) return
    setSubmitting(true)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from('comments') as any)
      .insert({
        post_id: post.id,
        author_id: member.id,
        body: draft.trim(),
      })
      .select('*, author:members(name, initials)')
      .single()
    if (data) {
      setComments(c => [...c, data as CommentDetail])
      setDraft('')
    }
    setSubmitting(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submitComment()
    }
  }

  const commentCount = comments.length

  return (
    <div className="post">
      {/* Header */}
      <div className="head">
        <div className="av" style={avatarStyle}>
          {authorInitials}
        </div>
        <div className="author">
          <div className="author-name">{authorName}</div>
          <div className="author-meta">{relativeTime(post.created_at)}</div>
        </div>
        {pillLabel && (
          <span className={`pill ${pillClass}`}>{pillLabel}</span>
        )}
      </div>

      {/* Body */}
      <div className="body">
        {post.quote && (
          <blockquote className="quote">{post.quote}</blockquote>
        )}
        <p>{post.body}</p>
      </div>

      {/* Actions */}
      <div className="actions">
        <button
          className={`action-btn${liked ? ' liked' : ''}`}
          onClick={toggleLike}
          title="Like"
        >
          <svg width="14" height="14" viewBox="0 0 22 22" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 19C11 19 3 13.5 3 8a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 5.5-8 11-8 11z" />
          </svg>
          {likeCount > 0 && <span>{likeCount}</span>}
          {likeCount === 0 && <span>Like</span>}
        </button>

        <button
          className="action-btn"
          onClick={() => setShowComments(s => !s)}
          title="Comments"
        >
          <svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H7l-4 3V5a1 1 0 0 1 1-1z" />
          </svg>
          <span>{commentCount > 0 ? commentCount : 'Reply'}</span>
        </button>

        <button
          className="action-btn"
          title="Share"
          onClick={() => {
            if (navigator.share) {
              navigator.share({ text: post.body }).catch(() => {})
            }
          }}
        >
          <svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="17" cy="5" r="2" /><circle cx="5" cy="11" r="2" /><circle cx="17" cy="17" r="2" />
            <line x1="7" y1="10" x2="15" y2="6" /><line x1="7" y1="12" x2="15" y2="16" />
          </svg>
          <span>Share</span>
        </button>

        <span className="ts">{relativeTime(post.created_at)}</span>
      </div>

      {/* Comments section */}
      {showComments && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--hair)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {comments.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <div
                className="av"
                style={{ width: 28, height: 28, fontSize: 11, flexShrink: 0, background: 'var(--warm)', color: 'var(--ink-mid)' }}
              >
                {c.author?.initials ?? '?'}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', lineHeight: 1.3 }}>
                  {c.author?.name ?? 'Member'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.55, marginTop: 2 }}>
                  {c.body}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink-faint)', fontFamily: 'var(--mono)', letterSpacing: '0.05em', marginTop: 2 }}>
                  {relativeTime(c.created_at)}
                </div>
              </div>
            </div>
          ))}

          {/* Comment input */}
          {member && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginTop: 4 }}>
              <div
                className="av"
                style={{ width: 28, height: 28, fontSize: 11, flexShrink: 0, background: 'var(--tropic-d)', color: '#fff' }}
              >
                {member.initials}
              </div>
              <div style={{ flex: 1, position: 'relative' }}>
                <textarea
                  className="input"
                  style={{ minHeight: 38, maxHeight: 100, paddingTop: 9, paddingBottom: 9, resize: 'none', fontSize: 13 }}
                  placeholder="Add a comment… (⌘↵ to send)"
                  value={draft}
                  onChange={e => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  rows={1}
                />
              </div>
              <button
                className="btn-primary"
                style={{ height: 38, padding: '0 14px', flexShrink: 0 }}
                onClick={submitComment}
                disabled={!draft.trim() || submitting}
              >
                <svg width="14" height="14" viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 11l16-7-7 16-2-7z" />
                </svg>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
