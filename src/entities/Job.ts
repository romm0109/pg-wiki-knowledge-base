import 'reflect-metadata';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import type { JobEvent } from './JobEvent';

@Entity('pgwiki_jobs')
export class Job {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar' })
  type!: string;

  @Column({ type: 'varchar' })
  status!: 'pending' | 'running' | 'succeeded' | 'failed';

  @Column({ type: 'text', nullable: true, name: 'error_message' })
  errorMessage!: string | null;

  @Column({ type: 'jsonb', nullable: true, name: 'tenant' })
  tenant!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true, default: () => "'{}'" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany('JobEvent', 'job')
  events!: JobEvent[];
}
