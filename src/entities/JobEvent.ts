import 'reflect-metadata';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type { Job } from './Job';

@Entity('pgwiki_job_events')
export class JobEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  type!: string;

  @Column({ type: 'jsonb', nullable: true })
  data!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne('Job', 'events', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_id' })
  job!: Job;
}
