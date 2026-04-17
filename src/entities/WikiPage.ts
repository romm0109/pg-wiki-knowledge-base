import 'reflect-metadata';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import type { WikiPageVersion } from './WikiPageVersion';

@Entity('pgwiki_wiki_pages')
export class WikiPage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  title!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'varchar' })
  type!: string;

  @Column({ type: 'varchar' })
  status!: 'draft' | 'published' | 'stale' | 'conflicted';

  @Column({ type: 'jsonb', nullable: true, name: 'tenant' })
  tenant!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true, default: () => "'{}'" })
  metadata!: Record<string, unknown>;

  @Column({ type: 'uuid', nullable: true, name: 'current_version_id' })
  currentVersionId!: string | null;

  @Column({ type: 'tsvector', nullable: true, name: 'search_vector', select: false })
  searchVector!: unknown;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany('WikiPageVersion', 'page')
  versions!: WikiPageVersion[];
}
