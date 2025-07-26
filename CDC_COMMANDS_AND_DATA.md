# CDC Commands and Data Documentation

## Table of Contents
1. [CDC Commands](#cdc-commands)
   - [sync-users](#sync-users)
   - [setup-db](#setup-db)
   - [user-rate](#user-rate)
   - [sync-tasks](#sync-tasks)
   - [generate-aggregates](#generate-aggregates)
   - [full-sync](#full-sync)
   - [purge-data](#purge-data)
   - [purge-logs](#purge-logs)
2. [CDC Data Structures](#cdc-data-structures)
   - [Users](#users)
   - [UserHourlyRates](#userhourlyrates)
   - [ClickUpLists](#clickuplists)
   - [Tasks](#tasks)
   - [TaskAssignees](#taskassignees)
   - [ReportedTaskAggregates](#reportedtaskaggregates)
   - [SyncLog](#synclog)
   - [CommandLogs](#commandlogs)

## CDC Commands

### sync-users

**Description**: Fetches users from ClickUp and synchronizes them with the local database.

**Parameters**:
- `--verbose` or `-V`: Enable verbose logging of all JSON requests and responses (boolean, default: false)

**Usage**:
```bash
node app.js sync-users [--verbose]
```

### setup-db

**Description**: Initializes or updates the database schema by running the latest migrations.

**Parameters**: None

**Usage**:
```bash
node app.js setup-db
```

### user-rate

**Description**: Manage user hourly rates.

**Subcommands**:

#### set

**Description**: Set a new hourly rate for a user from a specific date.

**Parameters**:
- `--userId`: ClickUp User ID (number, required)
- `--rate`: Hourly rate (number, required)
- `--fromDate`: Date from which the rate is effective (YYYY-MM-DD) (string, required)

**Usage**:
```bash
node app.js user-rate set --userId <userId> --rate <rate> --fromDate <YYYY-MM-DD>
```

#### list

**Description**: List all hourly rates for a user.

**Parameters**:
- `--userId`: ClickUp User ID (number, required)

**Usage**:
```bash
node app.js user-rate list --userId <userId>
```

#### deactivate

**Description**: Deactivate a specific hourly rate by setting its end date to yesterday.

**Parameters**:
- `--rateId`: Rate ID (number, required)

**Usage**:
```bash
node app.js user-rate deactivate --rateId <rateId>
```

### sync-tasks

**Description**: Fetches tasks from a ClickUp list and synchronizes them with the local database.

**Parameters**:
- `--listId`: ClickUp List ID to synchronize (string, required if not using --fullSyncAllLists)
- `--fullSync`: Perform a full synchronization instead of incremental (boolean, default: false)
- `--fullSyncAllLists`: Synchronize all lists in full sync mode (boolean, default: false)
- `--verbose` or `-V`: Enable verbose logging (boolean, default: false)

**Usage**:
```bash
node app.js sync-tasks --listId <listId> [--fullSync] [--verbose]
node app.js sync-tasks --fullSyncAllLists [--verbose]
```

### generate-aggregates

**Description**: Calculates total time spent on parent tasks (including subtasks) and stores them in ReportedTaskAggregates.

**Parameters**:
- `--listId`: Optional ClickUp List ID to limit aggregate generation (processes all parent tasks from this list) (string)
- `--userId`: Optional ClickUp User ID to limit aggregate generation to tasks assigned to this user (number)

**Usage**:
```bash
node app.js generate-aggregates [--listId <listId>] [--userId <userId>]
```

### full-sync

**Description**: Performs a full data synchronization: syncs users, fully syncs tasks for a list, and generates aggregates.

**Parameters**:
- `--listId`: ClickUp List ID for task synchronization and aggregate generation (string, required)

**Usage**:
```bash
node app.js full-sync --listId <listId>
```

### purge-data

**Description**: Deletes all data from all application tables. USE WITH CAUTION!

**Parameters**:
- `--confirm`: Confirm the data purge operation. Without this flag, no action will be taken (boolean, default: false)

**Usage**:
```bash
node app.js purge-data --confirm
```

### purge-logs

**Description**: Deletes all entries from the command logs table. USE WITH CAUTION!

**Parameters**:
- `--confirm`: Confirm the logs purge operation. Without this flag, no action will be taken (boolean, default: false)

**Usage**:
```bash
node app.js purge-logs --confirm
```

## CDC Data Structures

### Users

**Description**: Stores information about ClickUp users.

**Fields**:
- `clickup_user_id` (integer, primary key): ID of the user from ClickUp
- `username` (string, not nullable): Username from ClickUp
- `email` (string): Email address of the user
- `role` (integer): Role of the user (1=Owner, 2=Admin, 3=Member, 4=Guest)
- `is_active` (boolean, default: true): Whether the user is active
- `date_synced` (datetime, not nullable): Date of last synchronization

### UserHourlyRates

**Description**: Stores hourly rates for users with effective date ranges.

**Fields**:
- `rate_id` (integer, primary key, auto-increment): Internal auto-incrementing ID
- `user_id` (integer, not nullable): Foreign key to Users table
- `hourly_rate` (decimal(10,2), not nullable): Hourly rate (10 digits total, 2 after decimal point)
- `effective_from_date` (date, not nullable): Date from which the rate is effective
- `effective_to_date` (date, nullable): Date to which the rate is effective (NULL = current rate)

### ClickUpLists

**Description**: Stores information about ClickUp lists.

**Fields**:
- `clickup_list_id` (string, primary key): ID of the list from ClickUp
- `list_name` (string): Name of the list
- `last_successful_task_sync_timestamp` (datetime, nullable): Timestamp of last successful task synchronization

### Tasks

**Description**: Stores information about ClickUp tasks.

**Fields**:
- `clickup_task_id` (string, primary key): ID of the task from ClickUp
- `clickup_list_id` (string, not nullable): Foreign key to ClickUpLists table
- `name` (text, not nullable): Name of the task
- `parent_clickup_task_id` (string, nullable): Foreign key to parent task (for subtasks)
- `is_parent_flag` (boolean, default: false): Whether the task is marked as a parent task
- `extracted_month_from_name` (string, nullable): Month extracted from task name (for parent tasks)
- `custom_field_client_2025` (string, nullable): Client name from custom field
- `status_clickup` (string): Status of the task in ClickUp
- `time_spent_on_task_ms` (bigint, default: 0): Time spent on the task in milliseconds
- `date_created_clickup` (datetime): Creation date of the task in ClickUp
- `date_updated_clickup` (datetime): Last update date of the task in ClickUp
- `start_date` (datetime, nullable): Start date of the task
- `due_date` (datetime, nullable): Due date of the task
- `archived_clickup` (boolean, default: false): Whether the task is archived in ClickUp
- `date_last_synced` (datetime, not nullable): Date of last synchronization

### TaskAssignees

**Description**: Junction table storing the many-to-many relationship between tasks and users.

**Fields**:
- `clickup_task_id` (string, not nullable): Foreign key to Tasks table
- `clickup_user_id` (integer, not nullable): Foreign key to Users table
- Primary key: Composite key of (`clickup_task_id`, `clickup_user_id`)

### ReportedTaskAggregates

**Description**: Stores calculated time aggregates for parent tasks.

**Fields**:
- `clickup_parent_task_id` (string, not nullable): Foreign key to Tasks table
- `reported_for_user_id` (integer, not nullable): Foreign key to Users table
- `parent_task_name` (text, not nullable): Name of the parent task
- `client_name` (string, nullable): Client name
- `extracted_month_from_parent_name` (string, nullable): Month extracted from parent task name
- `total_time_minutes` (integer, not nullable): Total time spent in minutes
- `total_time_seconds` (integer, not nullable): Additional seconds (0-59)
- `last_calculated_at` (datetime, not nullable): Date of last calculation
- Primary key: Composite key of (`clickup_parent_task_id`, `reported_for_user_id`)

### SyncLog

**Description**: Stores logs of synchronization operations.

**Fields**:
- `log_id` (integer, primary key, auto-increment): Auto-incrementing ID
- `sync_start_time` (datetime, not nullable): Start time of synchronization
- `sync_end_time` (datetime, nullable): End time of synchronization
- `sync_type` (string, not nullable): Type of synchronization ("USERS", "TASKS_FULL", "TASKS_INCREMENTAL", "AGGREGATES")
- `target_list_id` (string, nullable): ClickUp List ID if applicable
- `items_fetched_new` (integer, default: 0): Number of new items fetched
- `items_updated` (integer, default: 0): Number of items updated
- `status` (string, not nullable): Status of synchronization ('SUCCESS', 'PARTIAL_FAILURE', 'FAILURE')
- `details_message` (text, nullable): Additional information or error messages

### CommandLogs

**Description**: Stores logs of command executions.

**Fields**:
- `log_id` (integer, primary key, auto-increment): Auto-incrementing ID
- `command_name` (string, not nullable): Name of the executed command
- `command_args` (text): JSON string of command arguments
- `start_time` (datetime, not nullable): When the command started
- `end_time` (datetime, nullable): When the command finished
- `status` (string): Status of the command ('started', 'completed', 'failed')
- `output` (text): Console output (truncated if too long)
- `error_message` (text): Error message if command failed
- `created_at` (datetime): Timestamp when log entry was created
- `updated_at` (datetime): Timestamp when log entry was last updated
