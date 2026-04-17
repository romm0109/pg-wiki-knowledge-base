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

@Entity('pgwiki_wiki_page_versions')
export class WikiPageVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'varchar', nullable: true, name: 'change_summary' })
  changeSummary!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne('WikiPage', 'versions', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'page_id' })
  page!: WikiPage;
}
