const fs = require('fs');
const { powerMonitor } = require('electron');
const vaultPath = 'C:/Users/ilane/Documents/Obisidian/Work/';
const selectTrigger = document.getElementById('custom-select-trigger');
const selectOptions = document.getElementById('custom-select-options');
const toggleBtn = document.getElementById('toggle-btn');
const calendarBtn = document.getElementById('calendar-btn');
const plusBtn = document.getElementById('plus-btn');
const timerDisplay = document.getElementById('timer-display');
const playIcon = document.getElementById('play-icon');
const stopIcon = document.getElementById('stop-icon');
const calendarIcon = document.getElementById('calendar-icon');
const plusIcon = document.getElementById('plus-icon');
const descriptionInput = document.getElementById('description-input');
const newTaskInput = document.getElementById('new-task-input');
const countdownInput = document.getElementById('countdown-input');

let startTime = null;
let elapsedTime = 0;
let timerInterval = null;
let isRunning = false;
let isNewTaskOpen= false;
let isCalendarOpen = false;
let pendingStopData = null;
let selectedTask = null;
let idleCheckInterval = null;
let wasAutoStopped = false;
const IDLE_TIMEOUT = 10 * 60; // 10 minutes in seconds
let isCountdownMode = false;
let countdownDuration = 25 * 60 * 1000; // Default 25 minutes in ms
let countdownRemaining = 0;
const countdownConfigPath = 'C:/Users/ilane/Documents/Obisidian/Work/countdown_config.json';

// Load saved countdown duration
try {
  if (fs.existsSync(countdownConfigPath)) {
    const config = JSON.parse(fs.readFileSync(countdownConfigPath, 'utf8'));
    if (config.duration) {
      countdownDuration = config.duration;
    }
  }
} catch (err) {
  console.error('Error loading countdown config:', err);
}

// Populate custom dropdown
fs.readdir(vaultPath, (err, files) => {
  if(err) return;
  files.filter(f => f.endsWith('.md') && f !== 'summary.md').forEach(f => {
    const option = document.createElement('div');
    option.className = 'custom-option';
    option.textContent = f.replace('.md', '');
    option.dataset.value = f;
    option.addEventListener('click', () => selectOption(f, option.textContent));
    selectOptions.appendChild(option);
  });
});

// Toggle dropdown
selectTrigger.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = selectOptions.style.display === 'block';
  const { ipcRenderer } = require('electron');

  if (isOpen) {
    selectOptions.style.display = 'none';
    selectTrigger.classList.remove('active');
    // Resize window back to widget height
    ipcRenderer.send('resize-window', 50);
  } else {
    selectOptions.style.display = 'block';
    selectTrigger.classList.add('active');
    // Calculate height needed for dropdown
    const optionCount = selectOptions.children.length;
    const dropdownHeight = Math.min(200, optionCount * 36);
    ipcRenderer.send('resize-window', 50 + dropdownHeight + 10);
  }
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  if (!e.target.closest('.custom-select-wrapper')) {
    if (selectOptions.style.display === 'block') {
      selectOptions.style.display = 'none';
      selectTrigger.classList.remove('active');
      const { ipcRenderer } = require('electron');
      ipcRenderer.send('resize-window', 50);
    }
  }
});

// Select option
function selectOption(value, text) {
  selectedTask = value;
  selectTrigger.textContent = text;
  selectOptions.style.display = 'none';
  selectTrigger.classList.remove('active');

  // Resize window back
  const { ipcRenderer } = require('electron');
  ipcRenderer.send('resize-window', 50);

  // Save selection
  fs.writeFileSync('C:/Users/ilane/Documents/Obisidian/Work/current.json', JSON.stringify({working: value}));
}

// Timer functions
function formatTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateTimer() {
  const currentTime = Date.now();

  if (isCountdownMode) {
    const elapsed = currentTime - startTime;
    const remaining = countdownRemaining - elapsed;

    if (remaining <= 0) {
      // Countdown finished - ask for description
      timerDisplay.textContent = '00:00:00';
      stopTimer(false); // Manual stop (shows description input)
    } else {
      timerDisplay.textContent = formatTime(remaining);
    }
  } else {
    const totalElapsed = elapsedTime + (currentTime - startTime);
    timerDisplay.textContent = formatTime(totalElapsed);
  }
}

function startTimer() {
  if (!selectedTask) {
    selectTrigger.style.borderColor = '#ff6b6b';
    selectTrigger.style.boxShadow = '0 0 0 3px rgba(255, 107, 107, 0.3)';
    setTimeout(() => {
      selectTrigger.style.borderColor = '';
      selectTrigger.style.boxShadow = '';
    }, 2000);
    return;
  }

  isRunning = true;
  startTime = Date.now();
  wasAutoStopped = false;

  // Set countdown remaining if in countdown mode
  if (isCountdownMode) {
    countdownRemaining = countdownDuration;
  }

  // Update button appearance
  toggleBtn.classList.add('playing');
  playIcon.style.display = 'none';
  stopIcon.style.display = 'block';
  timerDisplay.classList.add('running');

  timerInterval = setInterval(updateTimer, 100);

  // Start idle checking
  if (!idleCheckInterval) {
    idleCheckInterval = setInterval(checkIdle, 60000); // Check every minute
  }

  // Log start time
  const logEntry = {
    task: selectedTask,
    action: 'start',
    timestamp: new Date().toISOString()
  };
  appendToLog(logEntry);
}

function stopTimer(autoStop = false) {
  if (isRunning) {
    isRunning = false;
    clearInterval(timerInterval);

    if (!autoStop) {
      clearInterval(idleCheckInterval);
      idleCheckInterval = null;
    }

    const endTime = Date.now();
    let totalDuration;

    if (isCountdownMode) {
      // For countdown, duration is how much time was used (countdown - remaining)
      const elapsed = endTime - startTime;
      totalDuration = Math.min(countdownDuration, elapsed);
    } else {
      totalDuration = elapsedTime + (endTime - startTime);
    }

    // Update button appearance
    toggleBtn.classList.remove('playing');
    playIcon.style.display = 'block';
    stopIcon.style.display = 'none';
    timerDisplay.classList.remove('running');

    if (autoStop) {
      // Auto-stop: save immediately without description
      wasAutoStopped = true;

      // Log stop time and duration
      const logEntry = {
        task: selectedTask,
        action: 'stop',
        timestamp: new Date().toISOString(),
        duration: totalDuration
      };
      appendToLog(logEntry);

      // Write to markdown file without description
      writeToMarkdownFile(startTime, endTime, '');

      // Update summary
      updateSummary();

      // Reset timer
      elapsedTime = 0;
      startTime = null;
      if (!isCountdownMode) {
        timerDisplay.textContent = '00:00:00';
      } else {
        timerDisplay.textContent = formatTime(countdownDuration);
      }
    } else {
      // Manual stop: show description input
      pendingStopData = {
        startTime: startTime,
        endTime: endTime,
        duration: totalDuration,
        task: selectedTask
      };

      // Hide dropdown, show description input
      selectTrigger.style.display = 'none';
      descriptionInput.style.display = 'block';
      descriptionInput.value = '';

      // Ensure window can receive input
      setTimeout(() => {
        descriptionInput.focus();
        descriptionInput.click();
      }, 100);
    }
  }
}

function saveDescription() {
  if (!pendingStopData) return;

  const description = descriptionInput.value.trim();

  // Log stop time and duration
  const logEntry = {
    task: pendingStopData.task,
    action: 'stop',
    timestamp: new Date().toISOString(),
    duration: pendingStopData.duration
  };
  appendToLog(logEntry);

  // Write to markdown file
  writeToMarkdownFile(pendingStopData.startTime, pendingStopData.endTime, description);

  // Update summary
  updateSummary();

  // Show dropdown, hide description input
  descriptionInput.style.display = 'none';
  selectTrigger.style.display = 'block';
  elapsedTime = 0;
  startTime = null;
  pendingStopData = null;
  wasAutoStopped = false;
  if (!isCountdownMode) {
    timerDisplay.textContent = '00:00:00';
  } else {
    timerDisplay.textContent = formatTime(countdownDuration);
  }
}

function cancelEntry() {
  if (!pendingStopData) return;

  // Discard the entry without saving anything
  descriptionInput.style.display = 'none';
  selectTrigger.style.display = 'block';
  elapsedTime = 0;
  startTime = null;
  pendingStopData = null;
  wasAutoStopped = false;
  if (!isCountdownMode) {
    timerDisplay.textContent = '00:00:00';
  } else {
    timerDisplay.textContent = formatTime(countdownDuration);
  }
}

function appendToLog(entry) {
  const logPath = 'C:/Users/ilane/Documents/Obisidian/Work/time_log.json';
  let log = [];
  
  try {
    if (fs.existsSync(logPath)) {
      const data = fs.readFileSync(logPath, 'utf8');
      log = JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading log:', err);
  }
  
  log.push(entry);
  
  try {
    fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  } catch (err) {
    console.error('Error writing log:', err);
  }
}

// Toggle button event listener
toggleBtn.addEventListener('click', () => {
  if (isRunning) {
    stopTimer();
  } else {
    startTimer();
  }
});

calendarBtn.addEventListener('click', () => {
  if (isCalendarOpen) {

  } else {

  }
})

plusBtn.addEventListener('click', () => {
  if (!isNewTaskOpen) {
    newTaskInput.style.display = 'block';
    newTaskInput.value = '';

    setTimeout(() => {
      newTaskInput.focus();
      newTaskInput.click();
    }, 100);

  } else {
    newTaskInput.style.display = 'none';
    newTaskInput.value = '';

  }
})

// Timer display click to toggle countdown mode
timerDisplay.addEventListener('click', (e) => {
  e.stopPropagation();
  if (isRunning) return; // Don't allow mode change while running

  if (isCountdownMode) {
    // Switch back to stopwatch
    isCountdownMode = false;
    timerDisplay.textContent = '00:00:00';
    timerDisplay.classList.remove('countdown-mode');
  } else {
    // Show countdown input
    timerDisplay.style.display = 'none';
    countdownInput.style.display = 'block';
    // Initialize with last saved duration
    const hours = Math.floor(countdownDuration / (1000 * 60 * 60));
    const minutes = Math.floor((countdownDuration % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((countdownDuration % (1000 * 60)) / 1000);
    countdownDigits = String(hours).padStart(2, '0') + String(minutes).padStart(2, '0') + String(seconds).padStart(2, '0');
    countdownInput.value = countdownDigits.substring(0, 2) + ':' + countdownDigits.substring(2, 4) + ':' + countdownDigits.substring(4, 6);
    countdownInput.focus();
    countdownInput.select();
  }
});

// Countdown input handlers
let countdownDigits = '000000'; // Store as 6 digits HHMMSS

countdownInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    const hours = parseInt(countdownDigits.substring(0, 2));
    const minutes = parseInt(countdownDigits.substring(2, 4));
    const seconds = parseInt(countdownDigits.substring(4, 6));
    const totalMs = (hours * 60 * 60 + minutes * 60 + seconds) * 1000;
    if (totalMs > 0) {
      isCountdownMode = true;
      countdownDuration = totalMs;
      // Save countdown duration
      try {
        fs.writeFileSync(countdownConfigPath, JSON.stringify({ duration: countdownDuration }));
      } catch (err) {
        console.error('Error saving countdown config:', err);
      }
      timerDisplay.textContent = formatTime(countdownDuration);
      timerDisplay.classList.add('countdown-mode');
      timerDisplay.style.display = 'block';
      countdownInput.style.display = 'none';
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    // Cancel countdown mode
    timerDisplay.style.display = 'block';
    countdownInput.style.display = 'none';
  } else if (e.key === 'Backspace') {
    e.preventDefault();
    // Shift digits right and add 0 on the left
    countdownDigits = '0' + countdownDigits.substring(0, 5);
    countdownInput.value = countdownDigits.substring(0, 2) + ':' + countdownDigits.substring(2, 4) + ':' + countdownDigits.substring(4, 6);
  } else if (e.key >= '0' && e.key <= '9') {
    e.preventDefault();
    // Shift digits left and add new digit on the right
    countdownDigits = countdownDigits.substring(1) + e.key;
    countdownInput.value = countdownDigits.substring(0, 2) + ':' + countdownDigits.substring(2, 4) + ':' + countdownDigits.substring(4, 6);
  }
});

countdownInput.addEventListener('blur', () => {
  const hours = parseInt(countdownDigits.substring(0, 2));
  const minutes = parseInt(countdownDigits.substring(2, 4));
  const seconds = parseInt(countdownDigits.substring(4, 6));
  const totalMs = (hours * 60 * 60 + minutes * 60 + seconds) * 1000;
  if (totalMs > 0) {
    isCountdownMode = true;
    countdownDuration = totalMs;
    // Save countdown duration
    try {
      fs.writeFileSync(countdownConfigPath, JSON.stringify({ duration: countdownDuration }));
    } catch (err) {
      console.error('Error saving countdown config:', err);
    }
    timerDisplay.textContent = formatTime(countdownDuration);
    timerDisplay.classList.add('countdown-mode');
  }
  timerDisplay.style.display = 'block';
  countdownInput.style.display = 'none';
});

// Prevent paste and other input
countdownInput.addEventListener('input', (e) => {
  e.preventDefault();
});

// Write time entry to markdown file
function writeToMarkdownFile(startTimeMs, endTimeMs, description) {
  if (!selectedTask) return;

  const filePath = vaultPath + selectedTask;
  const startDate = new Date(startTimeMs);
  const endDate = new Date(endTimeMs);

  // Format date as DD.MM.YYYY
  const day = String(startDate.getDate()).padStart(2, '0');
  const month = String(startDate.getMonth() + 1).padStart(2, '0');
  const year = startDate.getFullYear();
  const dateStr = `${day}.${month}.${year}`;

  // Format times as HH:MM
  const startTimeStr = startDate.toTimeString().substring(0, 5);
  const endTimeStr = endDate.toTimeString().substring(0, 5);

  // Create entry line
  const entry = `${startTimeStr} - ${endTimeStr}${description ? ': ' + description : ''}`;

  // Read existing content
  let content = '';
  try {
    if (fs.existsSync(filePath)) {
      content = fs.readFileSync(filePath, 'utf8');
    }
  } catch (err) {
    console.error('Error reading markdown file:', err);
    return;
  }

  // Check if date exists in file
  const lines = content.split('\n');
  let dateIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === dateStr) {
      dateIndex = i;
      break;
    }
  }

  if (dateIndex !== -1) {
    // Date exists, find where to insert (at end of this date's section)
    let insertIndex = dateIndex + 1;
    // Find the next date line or end of file
    for (let i = dateIndex + 1; i < lines.length; i++) {
      // Check if line looks like a date (DD.MM.YYYY format)
      if (lines[i].trim().match(/^\d{2}\.\d{2}\.\d{4}$/)) {
        break;
      }
      insertIndex = i + 1;
    }
    lines.splice(insertIndex, 0, entry);
  } else {
    // Date doesn't exist, add new section at bottom
    if (content.trim()) {
      lines.push(''); // Add blank line if file has content
    }
    lines.push(dateStr);
    lines.push(entry);
  }

  // Write back to file
  try {
    fs.writeFileSync(filePath, lines.join('\n'));
  } catch (err) {
    console.error('Error writing markdown file:', err);
  }
}

// Update summary.md with daily statistics
function updateSummary() {
  const logPath = 'C:/Users/ilane/Documents/Obisidian/Work/time_log.json';
  const summaryPath = 'C:/Users/ilane/Documents/Obisidian/Work/summary.md';

  // Read time log
  let log = [];
  try {
    if (fs.existsSync(logPath)) {
      const data = fs.readFileSync(logPath, 'utf8');
      log = JSON.parse(data);
    }
  } catch (err) {
    console.error('Error reading time log:', err);
    return;
  }

  // Get today's date
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD for comparison

  // Calculate ALL-TIME totals
  const allTimeTaskDurations = {};
  let allTimeTotalDuration = 0;
  log.forEach(entry => {
    if (entry.action === 'stop') {
      const taskName = entry.task.replace('.md', '');
      if (!allTimeTaskDurations[taskName]) {
        allTimeTaskDurations[taskName] = 0;
      }
      allTimeTaskDurations[taskName] += entry.duration;
      allTimeTotalDuration += entry.duration;
    }
  });

  // Calculate TODAY's totals
  const todayTaskDurations = {};
  let todayTotalDuration = 0;
  log.forEach(entry => {
    if (entry.action === 'stop' && entry.timestamp.startsWith(todayStr)) {
      const taskName = entry.task.replace('.md', '');
      if (!todayTaskDurations[taskName]) {
        todayTaskDurations[taskName] = 0;
      }
      todayTaskDurations[taskName] += entry.duration;
      todayTotalDuration += entry.duration;
    }
  });

  // Group entries by date for daily sections
  const dailyData = {};
  log.forEach(entry => {
    if (entry.action === 'stop') {
      const dateStr = entry.timestamp.split('T')[0]; // YYYY-MM-DD
      if (!dailyData[dateStr]) {
        dailyData[dateStr] = {};
      }
      const taskName = entry.task.replace('.md', '');
      if (!dailyData[dateStr][taskName]) {
        dailyData[dateStr][taskName] = 0;
      }
      dailyData[dateStr][taskName] += entry.duration;
    }
  });

  // Build summary content
  let content = 'TOTAL:\n';
  const allTimeTotalHours = (allTimeTotalDuration / (1000 * 60 * 60)).toFixed(2);
  content += `ALL TIME: ${allTimeTotalHours}h\n\n`;

  // Add all-time task breakdown
  const sortedAllTimeTasks = Object.entries(allTimeTaskDurations).sort((a, b) => b[1] - a[1]);
  sortedAllTimeTasks.forEach(([taskName, duration]) => {
    const hours = (duration / (1000 * 60 * 60)).toFixed(2);
    const percentage = ((duration / allTimeTotalDuration) * 100).toFixed(1);
    content += `${taskName}: ${hours}h | ${percentage}%\n`;
  });

  content += '\n---\n\n';

  // Add daily sections in reverse chronological order
  const sortedDates = Object.keys(dailyData).sort().reverse();
  sortedDates.forEach(dateStr => {
    const date = new Date(dateStr + 'T00:00:00');
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const formattedDate = `${day}.${month}.${year}`;

    const tasks = dailyData[dateStr];
    const dayTotal = Object.values(tasks).reduce((sum, duration) => sum + duration, 0);
    const dayTotalHours = (dayTotal / (1000 * 60 * 60)).toFixed(2);

    content += `${formattedDate}:\n`;
    content += `TOTAL: ${dayTotalHours}h\n\n`;

    const sortedTasks = Object.entries(tasks).sort((a, b) => b[1] - a[1]);
    sortedTasks.forEach(([taskName, duration]) => {
      const hours = (duration / (1000 * 60 * 60)).toFixed(2);
      const percentage = ((duration / dayTotal) * 100).toFixed(1);
      content += `${taskName}: ${hours}h | ${percentage}%\n`;
    });

    content += '\n';
  });

  // Write to summary.md
  try {
    fs.writeFileSync(summaryPath, content);
  } catch (err) {
    console.error('Error writing summary:', err);
  }
}

// Description input event listener
descriptionInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    saveDescription();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    cancelEntry();
  }
});

// Listen for toggle-timer message from main process (global hotkey)
const { ipcRenderer } = require('electron');
ipcRenderer.on('toggle-timer', () => {
  if (isRunning) {
    stopTimer();
  } else {
    startTimer();
  }
});

// Idle detection and auto-resume
function checkIdle() {
  if (isRunning) {
    const systemIdleTime = powerMonitor.getSystemIdleTime();
    if (systemIdleTime >= IDLE_TIMEOUT) {
      stopTimer(true); // Auto-stop
    }
  } else if (wasAutoStopped && !isRunning && selectedTask) {
    // Auto-resume if was auto-stopped and user is back
    const systemIdleTime = powerMonitor.getSystemIdleTime();
    if (systemIdleTime < 30) { // If active in last 30 seconds
      startTimer();
    }
  }
}

// Dragging is handled by CSS -webkit-app-region