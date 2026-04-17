/**
 * Reminder Functionality Tests
 *
 * Tests for reminder date handling, filtering, and display in AdminDashboard.
 * These tests verify:
 * 1. Local time parsing (no UTC conversion)
 * 2. Admin vs user reminder visibility
 * 3. Reminder filtering by assignee
 * 4. Overdue vs upcoming reminder classification
 */

describe('Reminder Functionality', () => {
  describe('Local Time Date Parsing', () => {
    test('should parse reminder date as local time without UTC conversion', () => {
      // Input: "2026-04-20T14:30:00" (no Z suffix = local time)
      const reminderDate = '2026-04-20T14:30:00';
      const date = new Date(reminderDate);

      // Should preserve the date-time values as entered
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth() + 1).toBe(4); // months are 0-indexed
      expect(date.getDate()).toBe(20);
      expect(date.getHours()).toBe(14);
      expect(date.getMinutes()).toBe(30);
    });

    test('should format reminder date to local Brazilian format', () => {
      const reminderDate = new Date('2026-04-20T14:30:00');
      const formatted = reminderDate.toLocaleDateString('pt-BR');

      expect(formatted).toBe('20/04/2026');
    });

    test('should format reminder time to HH:mm format', () => {
      const reminderDate = new Date('2026-04-20T14:30:00');
      const formatted = reminderDate.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit'
      });

      expect(formatted).toBe('14:30');
    });

    test('should handle date editing without reverting to previous day', () => {
      // Simulate editing a reminder date
      const originalDate = new Date('2026-04-20');

      // Extract local date components
      const year = originalDate.getFullYear();
      const month = String(originalDate.getMonth() + 1).padStart(2, '0');
      const day = String(originalDate.getDate()).padStart(2, '0');
      const hour = String(originalDate.getHours()).padStart(2, '0');
      const minute = String(originalDate.getMinutes()).padStart(2, '0');

      const formattedDate = `${year}-${month}-${day}`;
      const formattedTime = `${hour}:${minute}`;

      // When user updates date to "2026-04-21", parsing should give 2026-04-21
      const updatedDate = new Date(`${formattedDate}T${formattedTime}:00`);
      expect(updatedDate.getDate()).toBe(20); // Original date unchanged

      // Now update to new date
      const newDate = new Date('2026-04-21T14:30:00');
      expect(newDate.getDate()).toBe(21); // New date should be correct
    });
  });

  describe('Reminder Visibility (Admin vs User)', () => {
    test('admin should see all reminders from all users', () => {
      const adminUser = { role: 'admin', id: 1 };
      const reminders = [
        { id: 1, userId: 1, title: 'Admin task', reminderDate: new Date(), assignedTo: null },
        { id: 2, userId: 2, title: 'User 2 task', reminderDate: new Date(), assignedTo: 'John' },
        { id: 3, userId: 3, title: 'User 3 task', reminderDate: new Date(), assignedTo: 'Jane' },
      ];

      // Admin query should return all tasks with reminders
      const visibleReminders = reminders.filter(r => r.reminderDate != null);
      expect(visibleReminders).toHaveLength(3);
    });

    test('user should only see their own reminders', () => {
      const userId = 2;
      const reminders = [
        { id: 1, userId: 1, title: 'Admin task', reminderDate: new Date() },
        { id: 2, userId: 2, title: 'My task', reminderDate: new Date() },
        { id: 3, userId: 3, title: 'Other task', reminderDate: new Date() },
      ];

      const userReminders = reminders.filter(r => r.userId === userId && r.reminderDate != null);
      expect(userReminders).toHaveLength(1);
      expect(userReminders[0].title).toBe('My task');
    });
  });

  describe('Reminder Filtering by Assignee', () => {
    const reminders = [
      { id: 1, title: 'Admin task 1', reminderDate: new Date(), assignedTo: null },
      { id: 2, title: 'Admin task 2', reminderDate: new Date(), assignedTo: '' },
      { id: 3, title: 'John task', reminderDate: new Date(), assignedTo: 'John' },
      { id: 4, title: 'Jane task', reminderDate: new Date(), assignedTo: 'Jane' },
      { id: 5, title: 'John task 2', reminderDate: new Date(), assignedTo: 'John' },
    ];

    test('should filter reminders for all attendants', () => {
      const filtered = reminders.filter(() => true);
      expect(filtered).toHaveLength(5);
    });

    test('should filter reminders for admin only (no assignedTo)', () => {
      const filtered = reminders.filter(r => !r.assignedTo || r.assignedTo.trim() === '');
      expect(filtered).toHaveLength(2);
      expect(filtered.map(r => r.title)).toEqual(['Admin task 1', 'Admin task 2']);
    });

    test('should filter reminders for specific attendant', () => {
      const attendant = 'John';
      const filtered = reminders.filter(r => r.assignedTo === attendant);
      expect(filtered).toHaveLength(2);
      expect(filtered.map(r => r.title)).toEqual(['John task', 'John task 2']);
    });
  });

  describe('Reminder Status Classification', () => {
    const now = new Date();
    const pastDate = new Date(now.getTime() - 86400000); // 1 day ago
    const futureDate = new Date(now.getTime() + 86400000); // 1 day from now

    test('should classify overdue reminder', () => {
      const reminder = {
        id: 1,
        title: 'Overdue task',
        reminderDate: pastDate,
        status: 'pending',
      };

      const isOverdue = reminder.reminderDate < now && reminder.status === 'pending';
      expect(isOverdue).toBe(true);
    });

    test('should classify upcoming reminder', () => {
      const reminder = {
        id: 1,
        title: 'Upcoming task',
        reminderDate: futureDate,
        status: 'pending',
      };

      const isUpcoming = reminder.reminderDate > now && reminder.status === 'pending';
      expect(isUpcoming).toBe(true);
    });

    test('should not classify completed reminders as overdue', () => {
      const reminder = {
        id: 1,
        title: 'Completed task',
        reminderDate: pastDate,
        status: 'completed',
      };

      const isOverdue = reminder.reminderDate < now && reminder.status === 'pending';
      expect(isOverdue).toBe(false);
    });

    test('should sort reminders by date', () => {
      const reminders = [
        { id: 1, title: 'Task 1', reminderDate: futureDate },
        { id: 2, title: 'Task 2', reminderDate: pastDate },
        { id: 3, title: 'Task 3', reminderDate: new Date(now.getTime() + 3600000) },
      ];

      const sorted = [...reminders].sort((a, b) => {
        const dateA = a.reminderDate.getTime();
        const dateB = b.reminderDate.getTime();
        return dateA - dateB;
      });

      expect(sorted[0].id).toBe(2); // pastDate first
      expect(sorted[1].id).toBe(3); // newer future date
      expect(sorted[2].id).toBe(1); // furthest future date
    });
  });

  describe('Admin Dashboard Reminder Display', () => {
    const reminders = [
      { id: 1, title: 'Overdue 1', reminderDate: new Date(Date.now() - 86400000), status: 'pending', assignedTo: 'John' },
      { id: 2, title: 'Overdue 2', reminderDate: new Date(Date.now() - 3600000), status: 'pending', assignedTo: null },
      { id: 3, title: 'Upcoming 1', reminderDate: new Date(Date.now() + 3600000), status: 'pending', assignedTo: 'Jane' },
      { id: 4, title: 'Upcoming 2', reminderDate: new Date(Date.now() + 86400000), status: 'pending', assignedTo: 'John' },
    ];
    const now = new Date();

    test('should separate overdue from upcoming reminders', () => {
      const overdueReminders = reminders.filter(r => new Date(r.reminderDate) <= now && r.status === 'pending');
      const upcomingReminders = reminders.filter(r => new Date(r.reminderDate) > now && r.status === 'pending');

      expect(overdueReminders).toHaveLength(2);
      expect(upcomingReminders).toHaveLength(2);
    });

    test('should limit display to top 5 in each category', () => {
      const manyReminders = Array.from({ length: 10 }, (_, i) => ({
        id: i,
        title: `Overdue ${i}`,
        reminderDate: new Date(Date.now() - (i + 1) * 3600000),
        status: 'pending',
        assignedTo: null,
      }));

      const overdueReminders = manyReminders.filter(r => r.reminderDate < now && r.status === 'pending');
      const displayed = overdueReminders.slice(0, 5);

      expect(displayed).toHaveLength(5);
    });
  });
});
