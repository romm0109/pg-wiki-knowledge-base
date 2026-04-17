import 'reflect-metadata';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type { WikiPage } from './WikiPage';

@Entity('pgwiki_wiki_links')
export class WikiLink {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  type!: string;

  @Column({ type: 'jsonb', nullable: true, default: () => "'{}'" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne('WikiPage', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'from_page_id' })
  fromPage!: WikiPage;

  @ManyToOne('WikiPage', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'to_page_id' })
  toPage!: WikiPage;
}
