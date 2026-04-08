require("dotenv").config();
require('pg'); // explicitly require the "pg" module (for Vercel) 
const clientSessions = require("client-sessions");
const bcrypt = require('bcryptjs');  

//const Sequelize = require("sequelize");
//const connectDB = require("./config/db");
const { connectMongoDB, connectPostgres } = require("./config/db");
const User = require("./models/User");
const Task = require("./models/Task");

const express = require("express");
const path = require("path");
const app = express();
const port = process.env.PORT || 3000; 

const { randomUUID } = require("crypto");

//views setting
app.set("view engine", "ejs"); //for vercel , for rendering
app.set("views", path.join(__dirname + "/views"));

//middleWare setting
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true })); //convert form data to js
app.use(express.json());

// Session Middleware
app.use(
  clientSessions({
    cookieName: 'session', // this is the object name that will be added to 'req'
    secret: process.env.SESSION_SECRET, // this should be a long un-guessable string.
    duration: 20 * 60 * 1000, 
    activeDuration: 5 * 60 * 1000, 
  })
);
// make req.session.user available in ALL views, even when no user is logged in
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Authentication Middleware
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect("/login");
  }
  next();
}

function requireLogout(req, res, next) {
  if (req.session.user) {
    return res.redirect("/dashboard");
  }
  next();
}

// Routes
// -- User Routes --

// Register Page
app.get("/register", requireLogout, (req, res) => {
  res.render("register", { error: null, title: "Register" });
});

// Register Handler
app.post("/register", async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;
  //const errors = []; 
  try {
    // check if user is exist
    const registeredUser = await User.findOne({$or: [{username}, {email}]});
    if (registeredUser) {
      // check email / username is exist
      if (registeredUser.username === username) {
        return res.render("register", {
          error: "Username already exists",
          title: "Register"
        });
      } else {
        return res.render("register", {
          error: "Email already exists",
          title: "Register"
        });
      }
    }

    // verify both entered password are the same
    if (password !== confirmPassword) {
      return res.render("register", { 
        error: "Passwords do not match", 
        title: "Register"
      }); 
    }

    // verify password length
    if (password.length < 10) {
      return res.render("register", { 
        error: "Password must be at least 10 characters", 
        title: "Register"
      });
    }
    
    // create user with hashed password
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      username: username,
      password: hashedPassword,
      email: email
    });

    // session and render
    req.session.user = {                    
      id: newUser._id.toString(),           
      username: newUser.username,
      email: newUser.email
    };
    res.redirect("/dashboard");
    
  } catch (err) {
    console.error("Registration error:", err);
    
    // MongoDB error 11000
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      if (field === 'username') {
        return res.render("register", {
          error: "Username already exists",
          title: "Register"
        });
      } else if (field === 'email') {
        return res.render("register", {
          error: "Email already exists",
          title: "Register"
        });
      }
    }
    
    // other error
    res.render("register", {
      error: "Registration failed. Please try again.",
      title: "Register",
      //formData: req.body
    });
  }
});

// Login Page
app.get("/login", requireLogout, (req, res) => {  
  res.render("login", { error: null, title: "Login" });
});

// Login handler
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await User.findOne({$or: [{username}, {email: username}]});

    if (user && await bcrypt.compare(password, user.password)) {   
      req.session.user = {
        id: user._id.toString(),      
        username: user.username,
        email: user.email
      };
      return res.redirect("/dashboard");   
    }
    
    res.render("login", { 
      error: "Invalid username or password", 
      title: "Login" 
    });
  } catch(err) {
    console.error(err);
    res.render("login", {
      error: "Invalid username or password",
      title: "Login",
    });
  }
});

// Logout Handler : Destroy session and redirect to login
app.get("/logout", requireLogin, (req, res) => {
  req.session.reset();
  res.redirect("/login");
});

// -- Task Routes: private routes --

// Dashboard Page
app.get("/dashboard", requireLogin, (req, res) => {
  Task.findAll({
    where: { userId: req.session.user.id },
    order: [['createdAt', 'DESC']]
  })
  .then((tasks) => {
    const stats = {
      total: tasks.length,
      completed: tasks.filter(t => t.status === 'completed').length,
      pending: tasks.filter(t => t.status === 'pending').length
    };
    
    res.render("dashboard", { 
      user: req.session.user, 
      tasks, 
      stats,
      title: "Dashboard"
    });
  })
  .catch((err) => {
    console.error("Dashboard error:", err);
    res.status(500).send("Server error");
  });
});

// Home Page
app.get("/", (req, res) => {
  if (req.session?.user) {
    res.redirect("/dashboard");
  } else {
    res.redirect("/login");
  }
});

// Tasks List Page
app.get("/tasks", requireLogin, (req, res) => {
  Task.findAll({
    where: { userId: req.session.user.id },
    order: [['createdAt', 'DESC']]
  })
  .then(tasks => {
    res.render("tasks", { tasks, title: "Your Tasks", user: req.session.user });
  })
  .catch(err => {
    console.error(err);
    res.status(500).send("Server error");
  });
});

// Add Task Page
app.get("/tasks/add", requireLogin, (req, res) => {
  res.render("add-task", { error: null, title: "Add Task" });
});

// Add Task Handler
app.post("/tasks/add", requireLogin, (req, res) => {
  const { title, description, dueDate } = req.body;
  
  Task.create({
    title,
    description: description || null,
    dueDate: dueDate || null,
    status: 'pending',
    userId: req.session.user.id
  })
  .then(() => {
    res.redirect("/dashboard");
  })
  .catch((err) => {
    console.error("Create task error:", err);
    res.render("add-task", { 
      error: "Failed to create task", 
      title: "Add Task" 
    });
  });
});

// Edit Task Page
app.get("/tasks/edit/:id", requireLogin, (req, res) => {
  Task.findOne({
    where: { id: req.params.id, userId: req.session.user.id }
  })
  .then((task) => {
    if (!task) {
      return res.status(404).send("Task not found");
    }
    res.render("edit-task", { task, error: null, title: "Edit Task" });
  })
  .catch((err) => {
    console.error("Edit error:", err);
    res.status(500).send("Server error");
  });
});

// Edit Task Handler
app.post("/tasks/edit/:id", requireLogin, (req, res) => {
  const { title, description, dueDate } = req.body;
  
  Task.update(
    { title, description, dueDate },
    { where: { id: req.params.id, userId: req.session.user.id } }
  )
  .then(([updated]) => {
    if (!updated) {
      return res.status(404).send("Task not found");
    }
    res.redirect("/tasks");
  })
  .catch((err) => {
    console.error("Update error:", err);
    res.render("edit-task", { 
      task: { id: req.params.id, ...req.body },
      error: "Failed to update",
      title: "Edit Task"
    });
  });
});

// Delete Task Handler
app.post("/tasks/delete/:id", requireLogin, (req, res) => {
  Task.destroy({
    where: { id: req.params.id, userId: req.session.user.id }
  })
  .then((deleted) => {
    if (!deleted) {
      return res.status(404).send("Task not found");
    }
    res.redirect("/dashboard");
  })
  .catch((err) => {
    console.error("Delete error:", err);
    res.status(500).send("Server error");
  });
});

// Toggle Task Status Handler
app.post("/tasks/status/:id", requireLogin, (req, res) => {
  Task.findOne({
    where: { id: req.params.id, userId: req.session.user.id }
  })
  .then((task) => {
    if (!task) {
      return Promise.reject("Task not found");
    }
    const newStatus = task.status === 'pending' ? 'completed' : 'pending';
    return task.update({ status: newStatus });
  })
  .then(() => {
    //const ref = req.get('Referer') || '/tasks';
    //res.redirect(ref);
    res.redirect("/tasks");
  })
  .catch((err) => {
    console.error("Status error:", err);
    res.status(500).send("Server error");
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).render("404", { message: "Page not found", title: "404" });
});

function startAppServer() {
  return connectMongoDB()
    .then(() => connectPostgres())
    .then(() => {
      app.listen(port, () => {console.log(`Server running on http://localhost:${port}`);});
    })
    .catch((err) => {
      console.error("Failed to initialize:", err);
      process.exit(1);
    });
}

startAppServer();